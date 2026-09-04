---
"@sanity-labs/sanity-plugin-resonance": patch
---

Default serializer fixes found while checking real documents:

- A standfirst that is already emphasised is no longer wrapped in a second pair of underscores.
- Settings-like tokens inside custom blocks (`auto`, `dark`, `16:9`) and nested images without alt text (posters, thumbnails) are skipped instead of read out.
- Filenames and other name fields are always kept, and a nested code tab's filename now sits as a caption above its fence instead of drifting onto the parent block's line.
- Code fences are one backtick longer than the longest run inside the sample, so samples that contain fences cannot close early.
