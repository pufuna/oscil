package main

import (
	"errors"
	"math"
	"math/rand"
	"sync"
	"time"
)

// Simulated device (for testing without hardware: run with --sim)
var simMode bool

type simPort struct {
	mu         sync.Mutex
	closed     bool
	out        []byte
	seq        byte
	t0         time.Time
	g          [128]byte
	sys        [16]byte
	cmd        []byte
	queue      [][2]byte
	hold       int
	key        int
	latch      uint16
	scans      byte
	phase      float64
	mem        [][]byte
	period     int // ms between frames, like the firmware 'P' command (default 33)
	bufA, bufB []byte
}

func newSim() *simPort {
	s := &simPort{t0: time.Now(), period: 33}
	s.g[0x2d] = 16        // 2 ms/div... index 16 = 2ms
	s.g[6], s.g[2] = 2, 0 // CH1 index 6 = 1 V
	s.g[7], s.g[3] = 2, 0 // CH2 1 V
	s.g[0x14] = 3
	s.sys[0] = 3
	return s
}

func (s *simPort) Read(p []byte) (int, error) {
	s.mu.Lock()
	per := s.period
	s.mu.Unlock()
	time.Sleep(time.Duration(per) * time.Millisecond)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return 0, errors.New("closed")
	}
	// key handling: 10 ms scans
	for i := 0; i < 3; i++ {
		s.scans++
		if s.hold > 0 {
			s.hold--
			if s.hold == 0 {
				s.apply(s.key)
			}
		} else if len(s.queue) > 0 {
			s.key, s.hold = int(s.queue[0][0]), int(s.queue[0][1])
			s.queue = s.queue[1:]
		}
	}
	f := s.frame()
	for _, m := range s.mem {
		f = append(f, m...)
	}
	s.mem = nil
	n := copy(p, f)
	return n, nil
}

// pretend mapping: 0 left,1 right,2 up,3 down (CH1 volts)
func (s *simPort) apply(k int) {
	switch k {
	case 0:
		if s.g[0x2d] > 0 {
			s.g[0x2d]--
		}
	case 1:
		if s.g[0x2d] < 28 {
			s.g[0x2d]++
		}
	case 2:
		v := int(s.g[6])*3 + int(s.g[2])
		if v < 12 {
			v++
		}
		s.g[6], s.g[2] = byte(v/3), byte(v%3)
	case 3:
		v := int(s.g[6])*3 + int(s.g[2])
		if v > 0 {
			v--
		}
		s.g[6], s.g[2] = byte(v/3), byte(v%3)
	}
}

func (s *simPort) frame() []byte {
	tdivs := []float64{10e-9, 20e-9, 50e-9, 100e-9, 200e-9, 500e-9, 1e-6, 2e-6, 5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 100e-3, 200e-3, 500e-3, 1, 2, 5, 10, 20}
	vdivs := []float64{10e-3, 20e-3, 50e-3, 100e-3, 200e-3, 500e-3, 1, 2, 5, 10, 20, 50, 100}
	tdiv := tdivs[s.g[0x2d]]
	dt := tdiv / 25
	// free-running: random start phase each frame (like an untriggered scope)
	s.phase = rand.Float64() * 2 * math.Pi
	f := []byte{'F', 'S', '5', '3', 4, s.seq}
	s.seq++
	ln := 8 + 128 + 602 + 16 + 8 + 2
	f = append(f, byte(ln), byte(ln>>8))
	f = append(f, s.g[:]...)
	v1 := vdivs[int(s.g[6])*3+int(s.g[2])]
	v2 := vdivs[int(s.g[7])*3+int(s.g[3])]
	roll := tdiv >= 0.05
	base := 0.0
	if roll { // roll mode: the screen shows the last 301 samples of a continuous signal
		k := math.Floor(time.Since(s.t0).Seconds() / dt)
		base = (k - 300) * dt
		s.phase = 0
	}
	const so, ss = 212, 2 // deep buffer: screen sample i = buffer[so + ss*i]
	for c := 0; c < 2; c++ {
		val := func(t float64, nzv float64) float64 {
			var v float64
			if c == 0 {
				v = 2.0 * math.Sin(2*math.Pi*50*t+s.phase)
				if roll {
					v = 2.0*math.Sin(2*math.Pi*0.3*t) + 0.6*math.Sin(2*math.Pi*2.1*t)
				}
				v = 128 + v/v1*25 + nzv*1.2
			} else {
				drift := 2 * math.Pi * 0.05 * time.Since(s.t0).Seconds()
				v = 0.95 * 2.0 * math.Sin(2*math.Pi*50*t+s.phase-drift*0+drift-0.3)
				if math.Sin(2*math.Pi*4000*t) > 0.6 { // PWM carrier ripple, like a PT on a drive output
					v += 0.5
				}
				v = 128 + v/v2*25 + nzv*0.8
			}
			return math.Max(28, math.Min(228, v))
		}
		deep := make([]byte, 1024)
		for j := 0; j < 1024; j++ {
			t := float64(j-so)*dt/ss + base
			d := val(t, rand.NormFloat64())
			deep[j] = byte(d*0.9 + 10)
		}
		if c == 0 {
			s.bufA = deep
		} else {
			s.bufB = deep
		}
		for i := 0; i < 301; i++ {
			t := float64(i)*dt + base
			if roll {
				t = (math.Round(base/dt) + float64(i)) * dt
				h := uint64(int64(math.Round(t/dt))*2+int64(c)) * 0x9E3779B97F4A7C15
				h ^= h >> 29
				h *= 0xBF58476D1CE4E5B9
				h ^= h >> 32
				u := float64(h%10000)/10000 - 0.5
				f = append(f, byte(val(t, u*2.5)))
				continue
			}
			f = append(f, byte((float64(deep[so+ss*i])-10)/0.9+0.5))
		}
	}
	f = append(f, s.sys[:]...)
	kl := s.latch
	s.latch = 0
	busy := byte(len(s.queue))
	ik := byte(0xFF)
	if s.hold > 0 {
		busy += 16
		ik = byte(s.key)
	}
	f = append(f, byte(kl), byte(kl>>8), 0, 0, s.scans, busy, ik, 0)
	var sum uint16
	for _, c := range f {
		sum += uint16(c)
	}
	f = append(f, byte(sum), byte(sum>>8))
	return f
}

func (s *simPort) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cmd = append(s.cmd, p...)
	for len(s.cmd) >= 4 {
		if s.cmd[0] != 0xA5 {
			s.cmd = s.cmd[1:]
			continue
		}
		if s.cmd[1] == 'M' {
			if len(s.cmd) < 8 {
				break
			}
			ad := uint32(s.cmd[2]) | uint32(s.cmd[3])<<8 | uint32(s.cmd[4])<<16 | uint32(s.cmd[5])<<24
			n := int(s.cmd[6]) | int(s.cmd[7])<<8
			s.cmd = s.cmd[8:]
			if len(s.mem) == 0 && n >= 1 && n <= 2048 { // the firmware keeps one pending read and drops the rest
				s.mem = append(s.mem, s.memFrame(ad, n))
			}
			continue
		}
		c, a, b := s.cmd[1], s.cmd[2], s.cmd[3]
		s.cmd = s.cmd[4:]
		switch c {
		case 'K':
			if a < 15 && b > 0 && len(s.queue) < 15 {
				s.queue = append(s.queue, [2]byte{a, b})
			}
		case 'X':
			s.queue = nil
		case 'P':
			if a >= 10 {
				s.period = int(a)
			}
		}
	}
	return len(p), nil
}

func (s *simPort) Close() error {
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()
	return nil
}

// simulate physical key press (for learn-mode testing via /api/simkey)
func (s *simPort) press(bit int) {
	s.mu.Lock()
	s.latch |= 1 << bit
	s.mu.Unlock()
}

var simDev *simPort

func simList() []PortInfo {
	return []PortInfo{{Name: "SIM", Device: true, Desc: "Имитатор прибора"}}
}
func simOpen() (Port, error) {
	simDev = newSim()
	return simDev, nil
}

func (s *simPort) memFrame(ad uint32, n int) []byte {
	f := []byte{'M', 'R', '5', '3', 1, 0, 0, 0, byte(ad), byte(ad >> 8), byte(ad >> 16), byte(ad >> 24)}
	ln := 12 + n + 2
	f[6], f[7] = byte(ln), byte(ln>>8)
	for i := 0; i < n; i++ {
		a := ad + uint32(i)
		var v byte
		switch {
		case a >= 0x200000F8 && a < 0x200000F8+128:
			v = s.g[a-0x200000F8]
		case a >= 0x200006A8 && a < 0x20000AA8 && s.bufA != nil:
			v = s.bufA[a-0x200006A8]
		case a >= 0x20000AA8 && a < 0x20000EA8 && s.bufB != nil:
			v = s.bufB[a-0x20000AA8]
		default:
			v = byte(a * 7)
		}
		f = append(f, v)
	}
	var sum uint16
	for _, c := range f {
		sum += uint16(c)
	}
	return append(f, byte(sum), byte(sum>>8))
}
