//go:build !windows

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Non-Windows build is only for development/testing (simulator + local recordings dir).

func openPort(name string) (Port, error) {
	if simMode {
		return simOpen()
	}
	return nil, errors.New("реальный порт поддерживается только в Windows")
}
func listPorts() []PortInfo {
	if simMode {
		return simList()
	}
	return nil
}
func candidateRoots() []string {
	if d := os.Getenv("STUDIO_ROOTS"); d != "" {
		return filepath.SplitList(d)
	}
	return nil
}
func configDir() string { return filepath.Join(os.TempDir(), "pufservice-cfg") }
func outputDir() string { return filepath.Join(os.TempDir(), "pufservice-out") }
func openWindow(url string) <-chan struct{} {
	fmt.Println("open", url)
	return make(chan struct{}) // never closes
}
func openFolder(p string) {}
func fatal(msg string)      { fmt.Fprintln(os.Stderr, msg); os.Exit(1) }
func osName() string        { return "dev" }
