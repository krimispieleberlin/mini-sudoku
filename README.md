# Mini Sudoku Backend

Backend API for the hourly 4x4 Mini Sudoku game.

The frontend receives only puzzle clues. The solved grid and final password are generated and validated on the server so they cannot be decoded from the website frontend.

## Endpoints

### GET /api/puzzle/current

Returns the current hourly puzzle.

### POST /api/puzzle/submit

Submits a completed 4x4 grid. If the grid is correct, the response includes the hourly password.

## Local Development

```powershell
cd C:\Users\jedua\sudoku-backend
$env:MINI_SUDOKU_SECRET="replace-with-a-long-random-secret"
$env:PUBLIC_ORIGIN="http://localhost:3000"
npm start
```

The API runs at:

```text
http://localhost:4174
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| MINI_SUDOKU_SECRET | Yes in production | Private secret used to generate hourly puzzles and passwords. Never put this in frontend code. |
| PUBLIC_ORIGIN | Recommended | Frontend origin allowed by CORS, for example https://example.com. Defaults to `*` for local testing. |
| PORT | No | Server port. Defaults to 4174. Hosting providers often set this automatically. |

## Deployment Notes

Set MINI_SUDOKU_SECRET in the hosting provider's environment variable settings. Use a long random value.

For the frontend, set this before the frontend script:

```html
<script>
  window.MINI_SUDOKU_API_BASE = "https://your-backend-domain.com";
</script>
```

## Checks

```powershell
npm run check
```
