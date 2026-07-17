# Proofbit look mechanics

Proofbit looks around by keeping both feet, the lower torso, and the tail root anchored while the amber eyes lead, the muzzle and head follow with a small yaw or pitch, and the upper three rows of cobalt scales follow through by a smaller amount. The body must not rotate, skew, or tilt as a whole. The attached segmented tail stays curled close to the body and counterbalances by only a few pixels, lagging the head without flipping sides or changing length.

The eyes are physical amber eye globes inside dark fixed rims. Rotate each whole visible eye surface with its iris, pupil, rim highlight, and eyelids together; do not slide detached pupils over static eye whites. Head motion remains restrained and preserves the cream muzzle, face width, scale geometry, and calm meticulous expression.

## Cardinal pose families

- `000 up`: pupils and eye highlights sit high; eyelids open upward; the muzzle pitches up slightly, revealing a little more cream throat. The crown scales compress subtly while the feet and tail root stay fixed.
- `090 screen-right`: the nose tip, muzzle center, and both readable pupils move clearly to the right of the head center. The head yaws right, the far cheek and far eye narrow slightly, and a little more of the opposite side's scale edge becomes visible. The tail tip lags a few pixels left but remains curled and attached.
- `180 down`: pupils and eye highlights sit low; upper eyelids lower slightly; the muzzle dips toward the cream belly, exposing more crown scales. The upper torso compresses subtly without changing the baseline.
- `270 screen-left`: the nose tip, muzzle center, and both readable pupils move clearly to the left of the head center. The head yaws left, the far cheek and far eye narrow slightly, and the visible side treatment opposes `090`. The tail tip lags a few pixels right but remains curled and attached.

## Motion budget and continuity

Every 22.5-degree step moves the eyes first, then the muzzle/head by a small equal increment, then the upper scale plates and tail tip by a still smaller equal increment. Head size, torso width, foot placement, baseline, tail attachment, palette, outline weight, and cell registration stay constant. `157.5 -> 180`, `337.5 -> 000`, and all other adjacent pairs must be one smooth step with no snap, reversal, eye replacement, side flip, scale pop, or tail teleport.

Each direction must remain visibly distinct from neutral at normal pet size. Diagonals combine both required axes: up-right/down-right move gaze and muzzle to screen-right while pitching up/down; down-left/up-left move gaze and muzzle to screen-left while pitching down/up.
