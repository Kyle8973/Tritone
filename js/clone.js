// ============================================================
//  clone.js — Library size simulator for testing VirtualGrid
//
//  Set CLONE_ENABLED = true and CLONE_MULTIPLIER to however
//  many times you want to duplicate your real album list.
//
//  Usage: call cloneAlbumIndex() after albumIndex is populated
//  in loadLibrary(), then pass the result to vGrid.setItems().
//
//  Import BEFORE library.js in index.html:
//    <script src="js/clone.js"></script>
//    <script src="js/library.js"></script>
// ============================================================

const CLONE_ENABLED = false;   // ← flip to false to disable
const CLONE_MULTIPLIER = 500;     // ← 20x = ~20,000 albums if you have 1,000

/**
 * Duplicates albumIndex CLONE_MULTIPLIER times.
 * Each clone gets a unique id suffix so clicks still work
 * and cover art URLs remain valid (they reuse the real IDs).
 *
 * @param {Array} albums  - the real albumIndex array
 * @returns {Array}       - the expanded array, or the original if disabled
 */
function cloneAlbumIndex(albums) {
    if (!CLONE_ENABLED || CLONE_MULTIPLIER <= 1) return albums;

    const result = [];
    for (let i = 0; i < CLONE_MULTIPLIER; i++) {
        for (const album of albums) {
            result.push({
                ...album,
                // Unique id so loadAlbumTracks still maps to a real album
                id: album.id,
                // Append clone number to name so you can see the duplication
                name: i === 0 ? album.name : `${album.name} [×${i + 1}]`,
            });
        }
    }

    console.log(
        `[clone.js] 🧪 Library cloned ×${CLONE_MULTIPLIER}: ` +
        `${albums.length} real → ${result.length} total albums`
    );

    return result;
}