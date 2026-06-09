## Store frames bulk import (ZIP)

This folder contains a `manifest.csv` for the 8 frame PNGs you shared in chat.

### How to use in Admin

1. Create a ZIP with:
   - `manifest.csv` (from this folder)
   - the 8 PNG files listed in `imageFile` (same filenames, ZIP root)
2. Admin → Store → **Bulk Upload** → select the ZIP → Import

### Notes
- `category` is set to `frame` for all rows.
- `durationDays` is `0` (permanent).
- `coinCost` values are intentionally “random-ish” placeholders — edit as needed.

