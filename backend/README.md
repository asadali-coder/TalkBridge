# TalkBridge backend

Express 5, strict TypeScript, MongoDB/Mongoose, cookie authentication, Socket.IO and Cloudinary.

Copy `.env.example` to `.env`, configure your services, run `npm ci` then `npm run dev`.

Production: `npm run build` then `npm start`. Validation: `npm test`.

The optional `npm run seed` adds the original demonstration accounts to an empty development database, hashing their passwords. Do not run it against production.

See `../README.md` for the full setup, routes/behavior and deployment guidance.
