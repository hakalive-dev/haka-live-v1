# Bulk gift import package

## Files to include in your ZIP

For each row in `manifest.csv`, add to the ZIP root:

- `{id}.png` — thumbnail (required if `imageFile` is set)
- `{id}.svga` — animation (optional until you have the SVGA; leave `svgaFile` empty in CSV if missing)

Example for Love Ride:

```
manifest.csv
86.png
86.svga
93.png
93.svga
...
```

## Rename your assets

Your previews use numeric IDs. Rename each PNG/SVGA to match the `imageFile` / `svgaFile` columns (e.g. `86.png`, not `86-d7c0d59e-....png`).

## Import without SVGA (temporary)

If you only have PNGs for now, remove the `svgaFile` column values (or leave cells empty) for those rows. You can add SVGA later via **Edit Gift** in admin.

## Prices

`coinCost` / `beanValue` for **86, 93, 116, 121** match the existing seed catalogue. All other prices are **suggested** — edit `manifest.csv` before importing.

## Upload

Admin → Gift Catalogue → **Bulk Upload** → select your ZIP.
