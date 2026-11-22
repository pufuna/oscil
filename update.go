package main

// Self-update from the GitHub repository.
//
// The repository keeps the current Windows build in dist/: PUFService.exe and version.json
// ({"version":"1.5.0","sha256":"…","size":…,"notes":"…"}). The program reads both through the GitHub
// contents API (default branch), so a private repository works too when a read-only access token is set.
// The token is stored next to settings.json and is never sent back to the page.
//
// Replacing a running exe: Windows does not allow overwriting it, but allows renaming it. The new file
// is written as PUFService.exe.new, checked against sha256, the running exe is renamed to .old and the
// new one takes its name. Then the server closes its port, starts the new exe with --updated and exits;
// the page waits for /api/ping to report the new version and reloads itself.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const UpdateRepo = "pufuna/oscil"

type versionInfo struct {
	Version string `json:"version"`
	SHA256  string `json:"sha256"`
	Size    int64  `json:"size"`
	Notes   string `json:"notes"`
}

var httpSrv *http.Server

// the exe path is taken once at start: after the running file is renamed to .old, os.Executable()
// may already report the new name (it does on Linux), and we would restart the old version
var exePath = func() string {
	e, err := os.Executable()
	if err != nil {
		return ""
	}
	if r, err := filepath.EvalSymlinks(e); err == nil {
		e = r
	}
	return e
}()
var updMu sync.Mutex // one download at a time

func updateAPIBase() string {
	if b := os.Getenv("PUF_UPDATE_API"); b != "" { // for testing against a local server
		return strings.TrimRight(b, "/")
	}
	return "https://api.github.com"
}

func tokenPath() string { return filepath.Join(configDir(), "update.json") }

func loadToken() string {
	var t struct {
		Token string `json:"token"`
	}
	if b, err := os.ReadFile(tokenPath()); err == nil {
		json.Unmarshal(b, &t)
	}
	return strings.TrimSpace(t.Token)
}

func ghGet(path string, limit int64) ([]byte, error) {
	req, err := http.NewRequest("GET", updateAPIBase()+"/repos/"+UpdateRepo+"/contents/"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.raw")
	req.Header.Set("User-Agent", AppName+"/"+AppVersion)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	tok := loadToken()
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("нет связи с GitHub: %v", err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == 200:
	case resp.StatusCode == 404 && tok == "":
		return nil, errors.New("файл обновления не найден — репозиторий приватный: задайте ключ доступа GitHub")
	case resp.StatusCode == 404:
		return nil, errors.New("файл обновления не найден (или у ключа нет доступа к репозиторию)")
	case resp.StatusCode == 401:
		return nil, errors.New("ключ доступа GitHub не подходит или истёк")
	case resp.StatusCode == 403 || resp.StatusCode == 429:
		return nil, errors.New("GitHub временно ограничил запросы — попробуйте позже")
	default:
		return nil, fmt.Errorf("GitHub ответил %s", resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, errors.New("файл обновления слишком большой")
	}
	return b, nil
}

func latestVersion() (*versionInfo, error) {
	b, err := ghGet("dist/version.json", 64<<10)
	if err != nil {
		return nil, err
	}
	var v versionInfo
	if err := json.Unmarshal(b, &v); err != nil || v.Version == "" || len(v.SHA256) != 64 {
		return nil, errors.New("version.json в репозитории повреждён")
	}
	return &v, nil
}

// newerVersion: is a newer than b ("1.10.0" > "1.9.3")
func newerVersion(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x > y
		}
	}
	return false
}

func updateCheck(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{"current": AppVersion, "token": loadToken() != ""}
	if v, err := latestVersion(); err != nil {
		out["error"] = err.Error()
	} else {
		out["latest"], out["notes"], out["size"] = v.Version, v.Notes, v.Size
		out["available"] = newerVersion(v.Version, AppVersion)
	}
	json.NewEncoder(w).Encode(out)
}

func updateToken(w http.ResponseWriter, r *http.Request) {
	var t struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&t); err != nil {
		http.Error(w, "bad", 400)
		return
	}
	t.Token = strings.TrimSpace(t.Token)
	os.MkdirAll(configDir(), 0o755)
	if t.Token == "" {
		os.Remove(tokenPath())
	} else if err := os.WriteFile(tokenPath(), []byte(mustJSON(t)), 0o600); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Write([]byte("{}"))
}

func updateApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST", 405)
		return
	}
	if !updMu.TryLock() {
		http.Error(w, "обновление уже идёт", 409)
		return
	}
	defer updMu.Unlock()
	fail := func(msg string) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": msg})
	}
	v, err := latestVersion()
	if err != nil {
		fail(err.Error())
		return
	}
	if !newerVersion(v.Version, AppVersion) && r.URL.Query().Get("force") != "1" {
		fail("уже установлена последняя версия " + AppVersion)
		return
	}
	bin, err := ghGet("dist/PUFService.exe", 256<<20)
	if err != nil {
		fail(err.Error())
		return
	}
	sum := sha256.Sum256(bin)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), v.SHA256) {
		fail("контрольная сумма скачанного файла не совпала — обновление отменено")
		return
	}
	if err := selfReplace(bin); err != nil {
		fail("не удалось заменить программу: " + err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"version": v.Version})
	if fl, ok := w.(http.Flusher); ok {
		fl.Flush()
	}
	go func() {
		time.Sleep(400 * time.Millisecond)
		if httpSrv != nil {
			httpSrv.Close() // frees the port for the new instance and ends the page's event stream
		}
		if err := restartSelf(); err != nil {
			fatal("Программа обновлена, но не запустилась автоматически: " + err.Error() + "\nЗапустите PUFService.exe вручную.")
		}
		os.Exit(0)
	}()
}

func selfReplace(bin []byte) error {
	exe := exePath
	if exe == "" {
		return errors.New("не удалось определить путь к программе")
	}
	tmp, old := exe+".new", exe+".old"
	if err := os.WriteFile(tmp, bin, 0o755); err != nil {
		return err
	}
	os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, exe); err != nil {
		os.Rename(old, exe)
		return err
	}
	return nil
}

func restartSelf() error {
	exe := exePath
	args := []string{}
	for _, a := range os.Args[1:] {
		if a != "--updated" {
			args = append(args, a)
		}
	}
	// keep --nowindow last (main checks the last argument)
	if n := len(args); n > 0 && args[n-1] == "--nowindow" {
		args = append(append(args[:n-1:n-1], "--updated"), "--nowindow")
	} else {
		args = append(args, "--updated")
	}
	return exec.Command(exe, args...).Start()
}

// remove PUFService.exe.old left by the previous version (it may still be exiting for a moment)
func cleanupOld() {
	exe := exePath
	if exe == "" {
		return
	}
	for i := 0; i < 20; i++ {
		if err := os.Remove(exe + ".old"); err == nil || os.IsNotExist(err) {
			return
		}
		time.Sleep(500 * time.Millisecond)
	}
}
