"use client";

import { useEffect, useState } from "react";

/** Current app theme ("dark" | "light"), kept in sync with <html data-theme>. */
export function useAppTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

type MonacoLike = { editor: { defineTheme(name: string, data: unknown): void } };

/** Registers CodeMind's two editor themes (matching the app surfaces). Safe to call repeatedly. */
export function defineCodeMindThemes(monaco: MonacoLike) {
  monaco.editor.defineTheme("codemind-dark", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "6b7390", fontStyle: "italic" }, { token: "keyword", foreground: "a2adff" }, { token: "string", foreground: "7fe0b4" },
      { token: "number", foreground: "f5b84b" }, { token: "type", foreground: "4cc3f5" }, { token: "identifier", foreground: "eceef7" },
    ],
    colors: {
      "editor.background": "#0b0d14", "editor.foreground": "#eceef7", "editorLineNumber.foreground": "#4a516a", "editorLineNumber.activeForeground": "#a3aac0",
      "editor.lineHighlightBackground": "#141826", "editor.selectionBackground": "#31407a88", "editorGutter.background": "#0b0d14",
      "editorIndentGuide.background1": "#1c2030", "editorIndentGuide.activeBackground1": "#31384f", "scrollbarSlider.background": "#31384f66",
      "diffEditor.insertedTextBackground": "#3dd9a022", "diffEditor.removedTextBackground": "#ff7b8622", "diffEditor.insertedLineBackground": "#3dd9a014", "diffEditor.removedLineBackground": "#ff7b8614",
    },
  });
  monaco.editor.defineTheme("codemind-light", {
    base: "vs", inherit: true,
    rules: [
      { token: "comment", foreground: "7a8196", fontStyle: "italic" }, { token: "keyword", foreground: "4a56d6" }, { token: "string", foreground: "0b7a52" },
      { token: "number", foreground: "9a5b00" }, { token: "type", foreground: "0a6fb3" },
    ],
    colors: {
      "editor.background": "#fbfbfe", "editor.foreground": "#11131b", "editorLineNumber.foreground": "#9aa1b8", "editorLineNumber.activeForeground": "#444b63",
      "editor.lineHighlightBackground": "#f0f2f8", "editor.selectionBackground": "#4a56d630", "editorGutter.background": "#fbfbfe",
      "editorIndentGuide.background1": "#e5e8f2", "editorIndentGuide.activeBackground1": "#bcc3d8",
      "diffEditor.insertedTextBackground": "#0b8a5c22", "diffEditor.removedTextBackground": "#c4303f22", "diffEditor.insertedLineBackground": "#0b8a5c14", "diffEditor.removedLineBackground": "#c4303f12",
    },
  });
}

export const monacoThemeName = (t: "dark" | "light") => (t === "dark" ? "codemind-dark" : "codemind-light");

export const EDITOR_FONT = "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace";
