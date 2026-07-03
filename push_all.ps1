# PowerShell Script to Automatically Sync Private and Public Repositories
# Usage: powershell -File .\push_all.ps1 "Your commit message"

param (
    [string]$CommitMessage = "Update codebase"
)

# Ensure we are on the private-master branch (active development branch)
$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne "private-master") {
    Write-Host "Switching to private-master branch..." -ForegroundColor Cyan
    git checkout private-master
}

# 1. Add and commit all changes (including .agent configurations) to private-master
Write-Host "Staging and committing changes to private-master..." -ForegroundColor Cyan
git add .
git commit -m $CommitMessage

# 2. Push the private-master branch to the private repository's master branch
Write-Host "Pushing to private repository..." -ForegroundColor Cyan
git push private private-master:master --force

# 3. Prepare the clean public master branch
Write-Host "Switching to public master branch..." -ForegroundColor Cyan
git checkout master

# 4. Merge changes from private-master without committing yet
Write-Host "Merging changes into public master..." -ForegroundColor Cyan
git merge private-master --no-commit --no-ff -m $CommitMessage

# 5. Restore the public .gitignore and remove private files from tracking
Write-Host "Filtering out private agent configuration files..." -ForegroundColor Cyan
git checkout master -- .gitignore
git rm -r --cached .agent -f --ignore-unmatch *>$null

# 6. Commit the cleaned merge to the public master branch
Write-Host "Committing clean merge to public master..." -ForegroundColor Cyan
git commit -m $CommitMessage *>$null

# 7. Push to the public repository
Write-Host "Pushing to public repository (origin master)..." -ForegroundColor Cyan
git push origin master --force


# 8. Switch back to private-master for continued development
Write-Host "Switching back to private-master branch..." -ForegroundColor Cyan
git checkout private-master

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "SUCCESSFULLY PUSHED TO BOTH PRIVATE & PUBLIC REPOS!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
