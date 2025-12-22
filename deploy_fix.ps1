# Commit and Push Script
cd "C:\Users\mohit\.gemini\antigravity\playground\cryo-helix"

Write-Host "=== Git Status ===" -ForegroundColor Cyan
git status --short

Write-Host "`n=== Staging changes ===" -ForegroundColor Cyan
git add server/src/routes/webhook.js

Write-Host "`n=== Committing ===" -ForegroundColor Cyan
git commit -m "Fix: Add message deduplication to prevent duplicate bot responses"

Write-Host "`n=== Pushing to GitHub ===" -ForegroundColor Cyan
git push

Write-Host "`n✅ Done! Railway will auto-deploy in ~2 minutes" -ForegroundColor Green
