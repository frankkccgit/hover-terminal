#!/bin/zsh
# Usage: ./release.sh 0.1.1
# Bumps manifest.json + versions.json, commits, tags, pushes, and creates a GitHub release with the plugin files.
# BRAT picks the new release up automatically the next time Obsidian starts.
set -e
cd "$(dirname "$0")"
v=$1; [ -n "$v" ] || { echo "usage: $0 <version>"; exit 1; }
min=$(jq -r .minAppVersion manifest.json)
jq --arg v "$v" '.version=$v' manifest.json > m.tmp && mv m.tmp manifest.json
jq --arg v "$v" --arg m "$min" '.[$v]=$m' versions.json > v.tmp && mv v.tmp versions.json
git add -A && git commit -m "Release $v" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git tag "$v" && git push && git push origin "$v"
gh release create "$v" main.js manifest.json styles.css --title "$v" --generate-notes
