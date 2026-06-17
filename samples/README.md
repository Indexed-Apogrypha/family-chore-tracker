# Test sample photos

Reference/submission room photos for exercising the judge during testing — a real
"reference → submission" pair for the same room.

> **Note:** these two files need to be added from the original screenshots. They were
> shared in chat but the attachments weren't persisted to disk, so the bytes couldn't be
> copied in automatically. Add them with the filenames below (any of `.jpg`/`.jpeg`/`.png`).

## Expected files

| File | Role | What it shows |
| --- | --- | --- |
| `reference-tidy-room.jpg` | **reference** (accepted "done" state) | Bed neatly made with a folded throw, clear carpet, tidy cat tree, clear dresser top. Blue walls, white wardrobe + dresser, Harry Potter decor. |
| `submission-messy-room.jpg` | **submission** (judge this one) | Same room, messy: laundry piled on the bed and couch, clothes and shoes on the floor, a laundry basket out, dresser and cat-tree surfaces cluttered. |

## Expected verdict

The submission against this reference should be a **fail** — there are clear
**high**-severity deviations (clothing/items on the floor, bed covered in laundry,
cluttered surfaces). Useful as the canonical "obviously not tidy" fixture; the
fail-on-high-severity path in `evaluateVerdict` should fire and `status` should be
`confirmed` (the difference is unambiguous, so confidence should be high).

## Using them

With a vendor key set, run the end-to-end tracer against this pair:

```bash
# Gemini
GEMINI_API_KEY=... npm run demo -- \
  samples/reference-tidy-room.jpg samples/submission-messy-room.jpg "Tidy room"

# Claude
ANTHROPIC_API_KEY=... npm run demo -- \
  samples/reference-tidy-room.jpg samples/submission-messy-room.jpg "Tidy room"
```

Keyless, the fake judge ignores the bytes and always returns `CLEAN_PASS`, so these
samples only do real work once a vendor key is set (which also means real photos leave
the box — see `docs/compliance.md`).
