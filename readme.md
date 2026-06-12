![Expanding Tic-Tac-Toe](./expanding-tic-tac-toe.svg)

## Development

```sh
pnpm install
pnpm run dev
```

## Build

```sh
pnpm run build
```

## Vercel deployment

This app is configured to build with Vite into `dist` and to use relative asset paths so it works at both:

- `https://expandingtictactoe.vercel.app/`
- `https://thumbfeed.com/expanding-tic-tac-toe`

If `thumbfeed.com` is a separate Vercel project, add a rewrite there that strips the path prefix:

```json
{
  "source": "/expanding-tic-tac-toe/:path*",
  "destination": "https://expandingtictactoe.vercel.app/:path*"
}
```
