# Catalog & Judges

## The catalog

Sixteen items across five categories. Sixteen is deliberate: enough for the pairing
matrix and category-balance scoring to carry real signal, few enough that every item
gets individually crafted geometry and materials.

| Category | Items |
|---|---|
| Meats | Prosciutto di Parma, soppressata, salami rounds |
| Cheeses | Brie wedge, aged gouda, blue, cheddar cube |
| Produce | Grapes, fig halves, cornichons |
| Nuts & olives | Castelvetrano olives, marcona almonds, cashews |
| Carbs & extras | Water crackers, breadsticks, honeycomb |

Each entry in `game/catalog.ts` carries: price, category, a representative color
(used by the aesthetics scorer), its mesh generator and parameters, physics
properties, and whether it is **cloth** (the three meats and thin-cut cheeses) or
**rigid** (everything else).

Prices are tuned so that the obviously-fancy items cost enough to be worth roasting
the user over.

## Scoring

Both scores are deterministic functions of a `BoardSnapshot`. No randomness, no
network, no model.

### Aesthetics — Kai's axis

```
aesthetic = w1·coverage        how much of the board surface is used
          + w2·colorVariance   is there a color story, or is it all beige
          + w3·spatialEntropy  distributed, or clumped in one corner
          + w4·heightVariation flat plane vs. actual composition
          − w5·clustering      same-item huddles
          − w6·edgeCrowding    everything shoved against the rim
          − w7·fellOff         items on the floor
```

All computed from positions, radii and colors — pure geometry, no rendering
involved, which is why it lives in `game/` and tests in Node.

### Food — Bartholomew's axis

```
food = Σ pairingBonus        classic combinations that work
     − Σ clashPenalty        combinations that do not
     + categoryBalance       reward hitting all five groups
     − repetitionPenalty     the fourth salami is not a choice, it is a habit
     ± valueForMoney(totalSpent, avgQuality)
```

`pairings.ts` holds a hand-authored symmetric matrix over the 16 items. Fig and
blue score. Prosciutto and grapes score. Cornichons and honeycomb do not.

Pairing proximity matters — two items only pair if they're actually near each other
on the board, which quietly ties the two judges' axes together and rewards
thoughtful placement.

## The judges

Two stereotypical party-goers with far too much personality. **Neither judge
acknowledges the other's criteria as legitimate.**

### Kai — aesthetics

An influencer who cares exclusively about how the board photographs.

- **Vocabulary:** composition, color story, negative space, vibes, "the lighting on
  that gouda is doing NOTHING for me"
- **Hates:** symmetry, brown clusters, an empty board, anything that fell off
- **Loves:** color contrast, height variation, asymmetric balance
- **Blind spot:** does not care what anything tastes like, at all

### Bartholomew — food

An insufferable culinary purist with opinions about provenance.

- **Vocabulary:** pairing, terroir, restraint, provenance, "your cheddar is an
  insult"
- **Hates:** pre-sliced cheese, excessive olives, repetition, spending a lot on
  nothing
- **Loves:** classic pairings, category balance, restraint
- **Blind spot:** thinks arranging food attractively is a moral failing

## The dialogue director

`director.ts` is an event-driven engine over weighted templates. Lines bind to
triggers:

| Trigger | Example |
|---|---|
| Item fell off the board | both judges, competing interpretations |
| Nth identical item placed | Bartholomew, escalating |
| Clashing items land touching | Bartholomew |
| Price threshold crossed | either, on value |
| Board coverage milestone | Kai |
| Long idle pause | idle heckling |
| First item of a category | Kai on color, Bartholomew on choice |

A recently-used ring buffer prevents repeats within a session. Idle heckling fires
on a timer when nothing notable has happened, so the board is never silent for long.

Weights let the same trigger produce different lines depending on board state —
Kai's reaction to a fallen olive differs depending on whether the board is
otherwise pristine.

## Endgame

A tasting-menu-styled score card: both scores, both verdicts, the total spent, and
a high-res render of the finished board captured from the canvas and downloadable.
No backend, no accounts.
