//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"unsafe"
)

var (
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procGetCommState    = kernel32.NewProc("GetCommState")
	procSetCommState    = kernel32.NewProc("SetCommState")
	procSetCommTimeouts = kernel32.NewProc("SetCommTimeouts")
	procSetupComm       = kernel32.NewProc("SetupComm")
	procEscapeComm      = kernel32.NewProc("EscapeCommFunction")
	procPurgeComm       = kernel32.NewProc("PurgeComm")
	procGetDrives       = kernel32.NewProc("GetLogicalDrives")
	procGetDriveType    = kernel32.NewProc("GetDriveTypeW")
	advapi32            = syscall.NewLazyDLL("advapi32.dll")
	procRegEnumValue    = advapi32.NewProc("RegEnumValueW")
	user32              = syscall.NewLazyDLL("user32.dll")
	procMessageBox      = user32.NewProc("MessageBoxW")
)

type dcb struct {
	DCBlength  uint32
	BaudRate   uint32
	Flags      uint32
	wReserved  uint16
	XonLim     uint16
	XoffLim    uint16
	ByteSize   byte
	Parity     byte
	StopBits   byte
	XonChar    byte
	XoffChar   byte
	ErrorChar  byte
	EofChar    byte
	EvtChar    byte
	wReserved1 uint16
}

type commTimeouts struct {
	ReadIntervalTimeout         uint32
	ReadTotalTimeoutMultiplier  uint32
	ReadTotalTimeoutConstant    uint32
	WriteTotalTimeoutMultiplier uint32
	WriteTotalTimeoutConstant   uint32
}

type winPort struct{ h syscall.Handle }

func (p *winPort) Read(b []byte) (int, error) {
	var n uint32
	err := syscall.ReadFile(p.h, b, &n, nil)
	if err != nil {
		return 0, err
	}
	return int(n), nil
}
func (p *winPort) Write(b []byte) (int, error) {
	var n uint32
	err := syscall.WriteFile(p.h, b, &n, nil)
	return int(n), err
}
func (p *winPort) Close() error { return syscall.CloseHandle(p.h) }

func openPort(name string) (Port, error) {
	if simMode {
		return simOpen()
	}
	path, _ := syscall.UTF16PtrFromString(`\\.\` + name)
	h, err := syscall.CreateFile(path, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_EXISTING, 0, 0)
	if err != nil {
		if errors.Is(err, syscall.ERROR_ACCESS_DENIED) {
			return nil, errors.New("порт занят другой программой")
		}
		return nil, err
	}
	procSetupComm.Call(uintptr(h), 65536, 4096)
	var d dcb
	d.DCBlength = uint32(unsafe.Sizeof(d))
	procGetCommState.Call(uintptr(h), uintptr(unsafe.Pointer(&d)))
	d.BaudRate = 921600
	d.ByteSize = 8
	d.Parity = 0
	d.StopBits = 0
	d.Flags = 1 | (1 << 4) | (1 << 12) // binary, DTR enable, RTS enable
	if r, _, e := procSetCommState.Call(uintptr(h), uintptr(unsafe.Pointer(&d))); r == 0 {
		syscall.CloseHandle(h)
		return nil, e
	}
	to := commTimeouts{ReadIntervalTimeout: 0xFFFFFFFF, ReadTotalTimeoutMultiplier: 0xFFFFFFFF, ReadTotalTimeoutConstant: 40, WriteTotalTimeoutConstant: 500}
	procSetCommTimeouts.Call(uintptr(h), uintptr(unsafe.Pointer(&to)))
	procEscapeComm.Call(uintptr(h), 5) // SETDTR
	procPurgeComm.Call(uintptr(h), 0x0F)
	return &winPort{h: h}, nil
}

func regOpen(root syscall.Handle, path string) (syscall.Handle, bool) {
	var k syscall.Handle
	p, _ := syscall.UTF16PtrFromString(path)
	if syscall.RegOpenKeyEx(root, p, 0, syscall.KEY_READ, &k) != nil {
		return 0, false
	}
	return k, true
}

func regString(k syscall.Handle, name string) string {
	var typ, n uint32
	nm, _ := syscall.UTF16PtrFromString(name)
	buf := make([]uint16, 256)
	n = uint32(len(buf) * 2)
	if syscall.RegQueryValueEx(k, nm, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &n) != nil {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func regSubkeys(k syscall.Handle) []string {
	var out []string
	for i := uint32(0); ; i++ {
		buf := make([]uint16, 256)
		n := uint32(len(buf))
		if syscall.RegEnumKeyEx(k, i, &buf[0], &n, nil, nil, nil, nil) != nil {
			break
		}
		out = append(out, syscall.UTF16ToString(buf[:n]))
	}
	return out
}

func listPorts() []PortInfo {
	if simMode {
		return simList()
	}
	present := map[string]bool{}
	if k, ok := regOpen(syscall.HKEY_LOCAL_MACHINE, `HARDWARE\DEVICEMAP\SERIALCOMM`); ok {
		for i := uint32(0); ; i++ {
			name := make([]uint16, 256)
			nl := uint32(len(name))
			data := make([]uint16, 64)
			dl := uint32(len(data) * 2)
			var typ uint32
			r, _, _ := procRegEnumValue.Call(uintptr(k), uintptr(i), uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&nl)), 0, uintptr(unsafe.Pointer(&typ)), uintptr(unsafe.Pointer(&data[0])), uintptr(unsafe.Pointer(&dl)))
			if r != 0 {
				break
			}
			present[strings.ToUpper(syscall.UTF16ToString(data))] = true
		}
		syscall.RegCloseKey(k)
	}
	ours := map[string]bool{}
	for _, pid := range []string{"VID_2E3C&PID_5740"} {
		if k, ok := regOpen(syscall.HKEY_LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Enum\USB\`+pid); ok {
			for _, inst := range regSubkeys(k) {
				if dk, ok := regOpen(k, inst+`\Device Parameters`); ok {
					if pn := regString(dk, "PortName"); pn != "" {
						ours[strings.ToUpper(pn)] = true
					}
					syscall.RegCloseKey(dk)
				}
			}
			syscall.RegCloseKey(k)
		}
	}
	var out []PortInfo
	for p := range present {
		pi := PortInfo{Name: p, Device: ours[p]}
		if pi.Device {
			pi.Desc = "2C53T"
		}
		out = append(out, pi)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Device != out[j].Device {
			return out[i].Device
		}
		return comNum(out[i].Name) < comNum(out[j].Name)
	})
	return out
}

func comNum(s string) int { n, _ := leadNum(strings.TrimPrefix(strings.ToUpper(s), "COM")); return n }

func candidateRoots() []string {
	mask, _, _ := procGetDrives.Call()
	var out []string
	for i := 0; i < 26; i++ {
		if mask&(1<<i) == 0 {
			continue
		}
		root := string(rune('A'+i)) + `:\`
		p, _ := syscall.UTF16PtrFromString(root)
		t, _, _ := procGetDriveType.Call(uintptr(unsafe.Pointer(p)))
		if t == 2 || t == 3 { // removable or fixed (the scope appears as removable)
			if i < 2 { // skip floppy letters
				continue
			}
			out = append(out, root)
		}
	}
	return out
}

func configDir() string {
	d := os.Getenv("APPDATA")
	if d == "" {
		d = os.TempDir()
	}
	return filepath.Join(d, AppName)
}

func outputDir() string {
	h, _ := os.UserHomeDir()
	docs := filepath.Join(h, "Documents")
	if _, err := os.Stat(docs); err != nil {
		docs = h
	}
	return filepath.Join(docs, AppName)
}

func findBrowser() string {
	var c []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		b := os.Getenv(env)
		if b == "" {
			continue
		}
		c = append(c, filepath.Join(b, `Microsoft\Edge\Application\msedge.exe`), filepath.Join(b, `Google\Chrome\Application\chrome.exe`))
	}
	for _, p := range c {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func openWindow(url string) <-chan struct{} {
	b := findBrowser()
	if b == "" {
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		return nil
	}
	prof := filepath.Join(os.Getenv("LOCALAPPDATA"), AppName, "window")
	cmd := exec.Command(b, "--app="+url, "--user-data-dir="+prof, "--no-first-run", "--no-default-browser-check",
		"--window-size=1440,920", "--disable-features=Translate,msEdgeSidebarV2", "--disable-extensions",
		// keep timers running at full speed when the window is minimized or covered: start-up trend,
		// full-record reads and the event recorder must not slow down in the background
		"--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows")
	if err := cmd.Start(); err != nil {
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		return nil
	}
	ch := make(chan struct{})
	go func() { cmd.Wait(); close(ch) }()
	return ch
}

func openFolder(p string) {
	os.MkdirAll(p, 0o755)
	exec.Command("explorer", p).Start()
}

func fatal(msg string) {
	t, _ := syscall.UTF16PtrFromString(AppName)
	m, _ := syscall.UTF16PtrFromString(msg)
	procMessageBox.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
	os.Exit(1)
}

func osName() string { return "windows" }
