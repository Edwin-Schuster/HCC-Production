# Fonts

The app uses **Avenir Next LT Pro** in Regular (400) and Bold (700).

Avenir Next LT Pro is a licensed font, so it is not included here. Put your licensed files in this folder with these exact names:

- `AvenirNextLTPro-Regular.woff2` (or `.otf`)
- `AvenirNextLTPro-Bold.woff2` (or `.otf`)

Then rebuild the container (`docker compose up -d --build`).

If the files aren't here, browsers use Avenir Next LT Pro when it's installed on the device, then Avenir Next (built into Apple devices), then Nunito Sans.
