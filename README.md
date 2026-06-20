# BrainForge SAFEStudy GitHub/Netlify Package

Files:
- index.html: BrainForge SAFEStudy app
- netlify/functions/progress.js: cloud progress API
- netlify.toml: tells Netlify where the site and functions are
- supabase_schema.sql: database table setup, already run if your Supabase tables exist

Netlify environment variables required:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
