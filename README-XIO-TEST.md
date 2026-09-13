# dpmf-xio-indexer (TEST)

Fork of dpmf-xdx-indexer for **XIO** as the primary asset.

- Issuer: `rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU`
- Currency hex: `58494F0000000000000000000000000000000000`
- Do **not** use the XDX production Postgres database.
- Set `PGDATABASE=dpmf_xio_indexer_test` (or a dedicated Railway Postgres).
- CORS / API host placeholders use `*-TEST*` hostnames until real test deploys exist.

## Run locally
```bash
npm install
# create .env from XDX template but change PGDATABASE + XIO_* vars
npm run dev
```
