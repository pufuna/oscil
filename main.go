package main

import (
	"bytes"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const AppName = "PUFService"

// var (not const) so a test build can override it: -ldflags "-X main.AppVersion=…"
var AppVersion = "1.6.1"

const AppID = "pufservice"
const FixedPort = 53153

//go:embed web
var webFS embed.FS

// ---------------- serial link ----------------

type Port interface {
	Read(p []byte) (int, error)
	Write(p []byte) (int, error)
	Close() error
}

type PortInfo struct {
	Name   string `json:"name"`
	Device bool   `json:"device"` // our VID/PID
	Desc   string `json:"desc"`
}

type Link struct {
	mu       sync.Mutex
	port     Port
	name     string
	state    string // idle, searching, connected, error
	msg      string
	auto     bool
	want     string // explicitly requested port ("" = auto)
	frames   uint64
	bad      uint64
	lastData time.Time
	wq       chan []byte
}

var link = &Link{state: "idle", auto: true, wq: make(chan []byte, 64)}

func (l *Link) status() map[string]any {
	l.mu.Lock()
	defer l.mu.Unlock()
	return map[string]any{"state": l.state, "port": l.name, "msg": l.msg, "auto": l.auto, "frames": l.frames, "bad": l.bad}
}

func (l *Link) countBad() {
	l.mu.Lock()
	l.bad++
	l.mu.Unlock()
}

func (l *Link) setState(st, msg string) {
	l.mu.Lock()
	l.state, l.msg = st, msg
	l.mu.Unlock()
	hub.broadcast("status", mustJSON(l.status()))
}

// manager loop: keeps trying to connect while auto is on
func (l *Link) run() {
	for {
		l.mu.Lock()
		auto, want, connected := l.auto, l.want, l.port != nil
		l.mu.Unlock()
		if !connected && auto {
			name := want
			if name == "" {
				for _, p := range listPorts() {
					if p.Device {
						name = p.Name
						break
					}
				}
			}
			if name == "" {
				l.setState("searching", "прибор не найден — подключите кабель")
			} else {
				p, err := openPort(name)
				if err != nil {
					l.setState("error", name+": "+err.Error())
				} else {
					l.mu.Lock()
					l.port, l.name = p, name
					l.mu.Unlock()
					l.setState("connected", "")
					l.reader(p)
					l.mu.Lock()
					if l.port == p {
						l.port = nil
					}
					l.mu.Unlock()
					p.Close()
					l.setState("searching", name+" отключён")
				}
			}
		}
		time.Sleep(700 * time.Millisecond)
	}
}

func (l *Link) disconnect() {
	l.mu.Lock()
	l.auto = false
	p := l.port
	l.port = nil
	l.mu.Unlock()
	if p != nil {
		p.Close()
	}
	l.setState("idle", "")
}

func (l *Link) connect(name string) {
	l.mu.Lock()
	l.auto, l.want = true, name
	p := l.port
	l.port = nil
	l.mu.Unlock()
	if p != nil {
		p.Close()
	}
}

func (l *Link) reader(p Port) {
	done := make(chan struct{})
	go func() { // writer
		for {
			select {
			case <-done:
				return
			case b := <-l.wq:
				p.Write(b)
			}
		}
	}()
	defer close(done)
	buf := make([]byte, 0, 8192)
	tmp := make([]byte, 4096)
	silent := time.Now()
	for {
		n, err := p.Read(tmp)
		if err != nil {
			return
		}
		if n == 0 {
			if time.Since(silent) > 3*time.Second {
				l.mu.Lock()
				l.msg = "порт открыт, но данных нет — прибор в режиме осциллографа?"
				l.mu.Unlock()
				hub.broadcast("status", mustJSON(l.status()))
				silent = time.Now()
			}
			l.mu.Lock()
			stillMine := l.port == p
			l.mu.Unlock()
			if !stillMine {
				return
			}
			continue
		}
		silent = time.Now()
		buf = append(buf, tmp[:n]...)
		for {
			i := bytes.Index(buf, []byte("FS53"))
			if j := bytes.Index(buf, []byte("MR53")); j >= 0 && (i < 0 || j < i) {
				i = j
			}
			if i < 0 {
				if len(buf) > 3 {
					buf = append(buf[:0], buf[len(buf)-3:]...)
				}
				break
			}
			if i > 0 {
				buf = append(buf[:0], buf[i:]...)
			}
			if len(buf) < 8 {
				break
			}
			ln := int(buf[6]) | int(buf[7])<<8
			if ln < 16 || ln > 4096 {
				buf = append(buf[:0], buf[4:]...)
				l.countBad()
				continue
			}
			if len(buf) < ln {
				break
			}
			var s uint16
			for _, c := range buf[:ln-2] {
				s += uint16(c)
			}
			if s != uint16(buf[ln-2])|uint16(buf[ln-1])<<8 {
				// false header inside data or a damaged frame: skip only the signature,
				// so a real frame that starts inside these ln bytes is not lost
				buf = append(buf[:0], buf[4:]...)
				l.countBad()
				continue
			}
			f := make([]byte, ln)
			copy(f, buf[:ln])
			buf = append(buf[:0], buf[ln:]...)
			if f[0] == 'M' {
				hub.broadcast("mem", base64.StdEncoding.EncodeToString(f))
				continue
			}
			l.mu.Lock()
			l.frames++
			if l.msg != "" {
				l.msg = ""
			}
			l.mu.Unlock()
			hub.broadcast("frame", base64.StdEncoding.EncodeToString(f))
		}
	}
}

// ---------------- SSE hub ----------------

type Hub struct {
	mu      sync.Mutex
	clients map[chan [2]string]bool
	lastCli time.Time
	ever    bool
}

var hub = &Hub{clients: map[chan [2]string]bool{}}

func (h *Hub) broadcast(ev, data string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		select {
		case c <- [2]string{ev, data}:
		default: // slow client: drop
		}
	}
}

func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }

func sse(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no flush", 500)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	c := make(chan [2]string, 16)
	hub.mu.Lock()
	hub.clients[c] = true
	hub.ever = true
	hub.mu.Unlock()
	defer func() {
		hub.mu.Lock()
		delete(hub.clients, c)
		hub.lastCli = time.Now()
		hub.mu.Unlock()
	}()
	fmt.Fprintf(w, "event: status\ndata: %s\n\n", mustJSON(link.status()))
	fmt.Fprintf(w, "event: hello\ndata: %s\n\n", mustJSON(map[string]string{"app": AppName, "version": AppVersion, "os": osName()}))
	fl.Flush()
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case m := <-c:
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", m[0], m[1])
			fl.Flush()
		case <-tick.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		}
	}
}

// ---------------- recordings on the device drive ----------------

type RecFile struct {
	Name  string `json:"name"`
	Bin   string `json:"bin,omitempty"`
	Csv   string `json:"csv,omitempty"`
	Bmp   string `json:"bmp,omitempty"`
	Size  int64  `json:"size"`
	MTime int64  `json:"mtime"`
}
type RecSource struct {
	Root  string    `json:"root"`
	Label string    `json:"label"`
	Files []RecFile `json:"files"`
}

func scanRoot(root string) *RecSource {
	binDir := filepath.Join(root, "Screenshot simple file")
	bmpDir := filepath.Join(root, "Screenshot file")
	m := map[string]*RecFile{}
	found := false
	add := func(dir, ext string) {
		ents, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		found = true
		for _, e := range ents {
			if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ext) {
				continue
			}
			base := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
			rf := m[strings.ToLower(base)]
			if rf == nil {
				rf = &RecFile{Name: base}
				m[strings.ToLower(base)] = rf
			}
			info, _ := e.Info()
			p := filepath.Join(dir, e.Name())
			if ext == ".bin" {
				rf.Bin = p
			} else {
				rf.Bmp = p
			}
			if info != nil {
				rf.Size += info.Size()
				if t := info.ModTime().Unix(); t > rf.MTime {
					rf.MTime = t
				}
			}
		}
	}
	add(binDir, ".bin")
	add(bmpDir, ".bmp")
	if !found {
		return nil
	}
	src := &RecSource{Root: root, Label: root}
	for _, v := range m {
		src.Files = append(src.Files, *v)
	}
	sort.Slice(src.Files, func(i, j int) bool { return natLess(src.Files[i].Name, src.Files[j].Name) })
	return src
}

func natLess(a, b string) bool {
	na, ea := leadNum(a)
	nb, eb := leadNum(b)
	if ea && eb && na != nb {
		return na < nb
	}
	return a < b
}
func leadNum(s string) (int, bool) {
	n, ok := 0, false
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
		ok = true
	}
	return n, ok
}

var allowedMu sync.Mutex
var allowed = map[string]bool{}

func recordings(w http.ResponseWriter, r *http.Request) {
	var out []*RecSource
	for _, root := range candidateRoots() {
		if s := scanRoot(root); s != nil {
			out = append(out, s)
		}
	}
	if s := scanCSV(outputDir()); s != nil {
		out = append(out, s)
	}
	allowedMu.Lock()
	for _, s := range out {
		for _, f := range s.Files {
			if f.Bin != "" {
				allowed[f.Bin] = true
			}
			if f.Bmp != "" {
				allowed[f.Bmp] = true
			}
			if f.Csv != "" {
				allowed[f.Csv] = true
			}
		}
	}
	allowedMu.Unlock()
	if out == nil {
		out = []*RecSource{}
	}
	json.NewEncoder(w).Encode(out)
}

func fileGet(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	allowedMu.Lock()
	ok := allowed[p]
	allowedMu.Unlock()
	if !ok {
		http.Error(w, "forbidden", 403)
		return
	}
	b, err := os.ReadFile(p)
	if err != nil {
		http.Error(w, err.Error(), 404)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(b)
}

// ---------------- settings ----------------

func settingsPath() string {
	d := configDir()
	os.MkdirAll(d, 0o755)
	p := filepath.Join(d, "settings.json")
	if _, err := os.Stat(p); err != nil { // carry over settings (learned keys, sensors) from the old program name
		old := filepath.Join(filepath.Dir(d), "2C53T Studio", "settings.json")
		if b, err := os.ReadFile(old); err == nil {
			os.WriteFile(p, b, 0o644)
		}
	}
	return p
}

func settings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		b, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if !json.Valid(b) {
			http.Error(w, "bad json", 400)
			return
		}
		os.WriteFile(settingsPath(), b, 0o644)
		w.Write([]byte("{}"))
		return
	}
	b, err := os.ReadFile(settingsPath())
	if err != nil || !json.Valid(b) {
		b = []byte("{}")
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

// save a file chosen by the UI into Documents\PUFService
func saveFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data"` // base64
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<20)).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	name := filepath.Base(strings.ReplaceAll(req.Name, "\\", "/"))
	if name == "" || name == "." || name == ".." {
		http.Error(w, "bad name", 400)
		return
	}
	data, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	dir := outputDir()
	os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, data, 0o644); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"path": p, "dir": dir})
}

// ---------------- main ----------------

func main() {
	sim := len(os.Args) > 1 && os.Args[1] == "--sim"
	noWindow := len(os.Args) > 1 && (os.Args[len(os.Args)-1] == "--nowindow")
	updated := false // started by the previous version right after a self-update
	for _, a := range os.Args[1:] {
		if a == "--updated" {
			updated = true
		}
	}
	if updated {
		go cleanupOld()
	}

	// single instance: if our app already listens on the fixed port, just open another window
	if c, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", FixedPort), 300*time.Millisecond); err == nil {
		c.Close()
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/ping", FixedPort))
		if err == nil {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if strings.Contains(string(b), AppID) {
				openWindow(fmt.Sprintf("http://127.0.0.1:%d/", FixedPort))
				return
			}
		}
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", FixedPort))
	for i := 0; err != nil && updated && i < 30; i++ { // the old version may still be releasing the port
		time.Sleep(100 * time.Millisecond)
		ln, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", FixedPort))
	}
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fatal("Не удалось открыть локальный порт: " + err.Error())
		}
	}
	url := fmt.Sprintf("http://%s/", ln.Addr().String())

	if sim {
		simMode = true
	}
	go link.run()

	mime.AddExtensionType(".woff2", "font/woff2")
	sub, _ := fs.Sub(webFS, "web")
	mux := http.NewServeMux()
	static := http.FileServer(http.FS(sub))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		static.ServeHTTP(w, r)
	})
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"app":"%s","version":"%s"}`, AppID, AppVersion)
	})
	mux.HandleFunc("/api/events", sse)
	mux.HandleFunc("/api/ports", func(w http.ResponseWriter, r *http.Request) {
		ps := listPorts()
		if ps == nil {
			ps = []PortInfo{}
		}
		json.NewEncoder(w).Encode(ps)
	})
	mux.HandleFunc("/api/connect", func(w http.ResponseWriter, r *http.Request) {
		link.connect(r.URL.Query().Get("port"))
		w.Write([]byte("{}"))
	})
	mux.HandleFunc("/api/disconnect", func(w http.ResponseWriter, r *http.Request) {
		link.disconnect()
		w.Write([]byte("{}"))
	})
	mux.HandleFunc("/api/send", func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
		raw, err := base64.StdEncoding.DecodeString(string(b))
		if err != nil {
			http.Error(w, "bad", 400)
			return
		}
		select {
		case link.wq <- raw:
		default:
		}
		w.Write([]byte("{}"))
	})
	if simMode {
		mux.HandleFunc("/api/simkey", func(w http.ResponseWriter, r *http.Request) {
			var b int
			fmt.Sscan(r.URL.Query().Get("bit"), &b)
			if simDev != nil {
				simDev.press(b)
			}
		})
	}
	mux.HandleFunc("/api/recordings", recordings)
	mux.HandleFunc("/api/file", fileGet)
	mux.HandleFunc("/api/settings", settings)
	mux.HandleFunc("/api/save", saveFile)
	mux.HandleFunc("/api/opendir", func(w http.ResponseWriter, r *http.Request) {
		openFolder(outputDir())
		w.Write([]byte("{}"))
	})
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("{}"))
		go func() { time.Sleep(200 * time.Millisecond); os.Exit(0) }()
	})

	mux.HandleFunc("/api/update/check", updateCheck)
	mux.HandleFunc("/api/update/apply", updateApply)
	mux.HandleFunc("/api/update/token", updateToken)

	port := ln.Addr().(*net.TCPAddr).Port
	srv := &http.Server{Handler: guard(port, mux), ReadHeaderTimeout: 10 * time.Second}
	httpSrv = srv
	go srv.Serve(ln)

	if noWindow {
		fmt.Println("listening on", url)
		select {}
	}
	var exited <-chan struct{}
	if !updated || port != FixedPort { // after an update the old window reloads itself from the same address
		exited = openWindow(url)
	}
	// exit when the window is gone: browser process ended AND no page connected for a while
	for {
		time.Sleep(2 * time.Second)
		hub.mu.Lock()
		n, ever, last := len(hub.clients), hub.ever, hub.lastCli
		hub.mu.Unlock()
		procGone := exited == nil
		if exited != nil {
			select {
			case <-exited:
				procGone = true
			default:
			}
		}
		if ever && n == 0 && time.Since(last) > 6*time.Second && procGone {
			os.Exit(0)
		}
		if !ever && procGone && (exited != nil || updated) {
			// window process ended before page ever connected (handoff) – wait longer for a client
			time.Sleep(20 * time.Second)
			hub.mu.Lock()
			ever = hub.ever
			hub.mu.Unlock()
			if !ever {
				os.Exit(0)
			}
		}
	}
}

// CSV files saved by this program (Documents\PUFService)
func scanCSV(dir string) *RecSource {
	ents, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	src := &RecSource{Root: dir, Label: "saved"}
	for _, e := range ents {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".csv") {
			continue
		}
		info, _ := e.Info()
		rf := RecFile{Name: strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())), Csv: filepath.Join(dir, e.Name())}
		if info != nil {
			rf.Size, rf.MTime = info.Size(), info.ModTime().Unix()
		}
		src.Files = append(src.Files, rf)
	}
	if len(src.Files) == 0 {
		return nil
	}
	sort.Slice(src.Files, func(i, j int) bool { return src.Files[i].MTime > src.Files[j].MTime })
	return src
}

// guard protects the local API from other web pages open in any browser on this PC:
//   - Host must be our loopback address (blocks DNS rebinding);
//   - a cross-site Origin is refused;
//   - /api/* calls (except the read-only ping/events) must carry the X-PUF header,
//     which a foreign page cannot add without a CORS preflight that we never answer.
func guard(port int, h http.Handler) http.Handler {
	hosts := map[string]bool{}
	for _, n := range []string{"127.0.0.1", "localhost", "[::1]"} {
		hosts[fmt.Sprintf("%s:%d", n, port)] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hosts[strings.ToLower(r.Host)] {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		if o := r.Header.Get("Origin"); o != "" && !hosts[strings.ToLower(strings.TrimPrefix(strings.TrimPrefix(o, "http://"), "https://"))] {
			http.Error(w, "forbidden origin", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/ping" && r.URL.Path != "/api/events" && r.Header.Get("X-PUF") != "1" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		h.ServeHTTP(w, r)
	})
}
