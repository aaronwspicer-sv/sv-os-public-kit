# Spicer OS — kit build manifest

Generated: 2026-06-17T02:53:28.255Z
Files copied: ~303

## Stripped (not shipped to buyers):
- .git
- node_modules
- .next
- out
- build
- coverage
- backups
- .agents
- .claude
- .vercel
- tsconfig.tsbuildinfo
- src/components/site
- src/app/about
- src/app/os
- src/app/contact
- src/app/get
- src/app/api/waitlist
- src/app/api/contact
- public/aaron-aws.jpg
- public/aaron-pfp.jpg
- public/sv-logo.png
- public/sv-wordmark.svg
- public/sv-mark.svg
- public/sv-mark-light.svg
- public/demo-alfred
- scripts/publish-kit.ts
- all .env* files except .env.local.example

## Swapped:
- src/app/page.tsx → plain redirect to /d (marketing site removed)

## Next steps to publish:
1. Create an EMPTY private repo on GitHub (e.g. spicer-os-kit)
2. cd <kit output directory>
3. git init && git add -A && git commit -m 'Spicer OS kit'
4. git branch -M main
5. git remote add origin git@github.com:YOU/spicer-os-kit.git
6. git push -u origin main
7. Invite buyers as repo collaborators (or wire the delivery webhook).

Verify it builds before shipping: cd into the kit, `npm install`, `npm run build`.