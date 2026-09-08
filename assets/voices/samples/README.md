# Voice samples

Drop short (8–15 sec) MP3 clips here, one per live narrator, using the voice slug as the filename:

- `aubrey.mp3`
- `dr-z.mp3`
- `grandpa.mp3`
- `natasha.mp3`

Coming-soon voices (Alicia, Grandma) skip the play button; add their clips when the voices go live.

## Enabling a sample on the site

In `index.html`, add a `data-sample` attribute to the matching `.voice-card`:

```html
<div class="voice-card" data-sample="./assets/voices/samples/aubrey.mp3">
  …
</div>
```

The scaffold in `index.html` picks it up automatically — renders a play button, enforces one-at-a-time playback, keeps `aria-pressed` in sync.

## Format

- MP3, 128 kbps mono is plenty. ~200 KB per 12-second clip.
- WebM works too (`.webm`, `type="audio/webm"`), better compression but broader compatibility with MP3 wins here.
- Aim for the **same 1–2 sentences per voice** so listeners compare voices on identical material.
- Normalize loudness to about **-16 LUFS** — matches the podcast target and reads consistently across cards.
