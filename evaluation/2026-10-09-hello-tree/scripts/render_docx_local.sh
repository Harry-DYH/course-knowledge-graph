#!/usr/bin/env bash
set -euo pipefail
# Optional macOS document QA helper; not needed for scoring or extraction.
# Supply the installed renderer path because plugin versions differ by machine.
TASK_RUNTIME="${CKG_DOCX_RUNTIME_ROOT:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies}"
TASK_RENDERER="${CKG_DOCX_RENDERER:-}"
if [[ ! -x "$TASK_RUNTIME/python/bin/python3" || ! -f "$TASK_RENDERER" ]]; then
  printf '%s\n' 'Set CKG_DOCX_RUNTIME_ROOT to the bundled dependencies directory and CKG_DOCX_RENDERER to its installed documents render_docx.py path.' >&2
  exit 2
fi
TASK_FONTCONFIG="$TASK_RUNTIME/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fontconfig/fonts.conf"
if [[ -f "$TASK_FONTCONFIG" ]]; then
  export FONTCONFIG_FILE="$TASK_FONTCONFIG"
fi
"$TASK_RUNTIME/python/bin/python3" "$TASK_RENDERER" "$@"
