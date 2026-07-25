/**
 * Judge dialogue.
 *
 * Lines are weighted templates bound to triggers. `{food}`, `{count}`, `{note}`
 * and `{spend}` are substituted by the director.
 *
 * The two voices should never be interchangeable. Kai talks about how things
 * *look* and has no idea what anything tastes like. Bartholomew talks about
 * what things *are* and considers arranging food attractively to be a moral
 * failing. Neither acknowledges that the other's criteria are legitimate.
 */

export type Judge = "kai" | "bartholomew";

export type TriggerId =
  | "first-item"
  | "item-placed"
  | "item-fell"
  | "repetition"
  | "clash-placed"
  | "pairing-placed"
  | "spend-milestone"
  | "board-untouched"
  | "board-empty-ish"
  | "board-crowded"
  | "idle"
  | "category-new";

export interface Line {
  judge: Judge;
  trigger: TriggerId;
  /** Higher is more likely to be chosen among eligible lines. */
  weight: number;
  text: string;
}

export const LINES: Line[] = [
  // --- nothing placed yet -------------------------------------------------
  // These have a job beyond the joke: a first-time player needs to learn that
  // the menu is where you start. Each one says so while staying in character,
  // and they get less patient as they go.
  { judge: "kai", trigger: "board-untouched", weight: 1.4, text: "So it's an empty board. Very conceptual. Pick something off the menu and let's see what we're actually doing." },
  { judge: "bartholomew", trigger: "board-untouched", weight: 1.4, text: "The menu is to your right. One chooses from it. That is the arrangement." },
  { judge: "kai", trigger: "board-untouched", weight: 1.1, text: "Choose something on the right, then click where you want it. That's the whole thing." },
  { judge: "bartholomew", trigger: "board-untouched", weight: 1.1, text: "Nothing has been selected. Nothing, therefore, can be judged. Do begin." },
  { judge: "kai", trigger: "board-untouched", weight: 0.9, text: "I cannot photograph a plank. Give me something to work with." },
  { judge: "bartholomew", trigger: "board-untouched", weight: 0.9, text: "I have reviewed empty boards before. They score poorly." },
  { judge: "kai", trigger: "board-untouched", weight: 0.7, text: "We're still just looking at wood. Lovely wood. Wrong genre." },
  { judge: "bartholomew", trigger: "board-untouched", weight: 0.7, text: "Take your time. The board is not going anywhere. Neither, apparently, are we." },

  // --- opening ------------------------------------------------------------
  { judge: "kai", trigger: "first-item", weight: 1, text: "Okay. One thing. On a large empty board. Very brave, very minimal." },
  { judge: "kai", trigger: "first-item", weight: 1, text: "Starting with {food}. Bold anchor choice. I'm not saying good, I'm saying bold." },
  { judge: "bartholomew", trigger: "first-item", weight: 1, text: "We begin with {food}. I shall reserve judgement, briefly." },
  { judge: "bartholomew", trigger: "first-item", weight: 1, text: "{food} first. That tells me something about you already." },

  // --- routine placement --------------------------------------------------
  { judge: "kai", trigger: "item-placed", weight: 1, text: "Mm. Sure. The {food} is doing something there." },
  { judge: "kai", trigger: "item-placed", weight: 1, text: "Love that for you. The negative space is fighting back a little." },
  { judge: "kai", trigger: "item-placed", weight: 0.8, text: "The {food} landed exactly where it wanted to, which is not the same as where it should be." },
  { judge: "kai", trigger: "item-placed", weight: 0.6, text: "I'd photograph that from the other side. Just the other side." },
  { judge: "kai", trigger: "item-placed", weight: 0.7, text: "That's a lot of visual weight on one side. But go off." },
  { judge: "kai", trigger: "item-placed", weight: 0.7, text: "The {food} is fine. It's a supporting character. It knows that." },
  { judge: "kai", trigger: "item-placed", weight: 0.6, text: "Texture's improving. Colour's still doing whatever it wants." },
  { judge: "kai", trigger: "item-placed", weight: 0.5, text: "I want to like where the {food} is. I'm working on it." },
  { judge: "kai", trigger: "item-placed", weight: 0.5, text: "Every board has one thing that ruins the shot. I'm not saying it's the {food}." },
  { judge: "bartholomew", trigger: "item-placed", weight: 1, text: "{food}. Fine. Adequate. Present." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.8, text: "One does not simply add {food} and call it composition." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.6, text: "I note the {food}. I note it without enthusiasm." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.7, text: "The {food} has been placed. Whether it has been *considered* is another matter." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.6, text: "More {food}. The board grows. Does it improve? We shall see." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.5, text: "I have eaten better. I have also eaten worse. Neither is a compliment." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.5, text: "A board should have a thesis. So far this one has a shopping list." },

  // --- casualties ---------------------------------------------------------
  { judge: "kai", trigger: "item-fell", weight: 1.6, text: "It's on the floor. That's a choice. That's a whole choice." },
  { judge: "kai", trigger: "item-fell", weight: 1.4, text: "The {food} has left the composition entirely. Honestly? Cleaner without it." },
  { judge: "kai", trigger: "item-fell", weight: 1.2, text: "We're losing pieces off the edge and I am simply watching it happen." },
  { judge: "bartholomew", trigger: "item-fell", weight: 1.5, text: "That {food} is on the floor. Where I come from, that is called waste." },
  { judge: "bartholomew", trigger: "item-fell", weight: 1.3, text: "You have paid for that {food}. It is now decor for the tiles." },

  // --- repetition ---------------------------------------------------------
  { judge: "bartholomew", trigger: "repetition", weight: 2, text: "{count} of them. {count}. At what point does this stop being a board and start being an intervention?" },
  { judge: "bartholomew", trigger: "repetition", weight: 1.8, text: "That is the {count}th {food}. I am counting. I will keep counting." },
  { judge: "bartholomew", trigger: "repetition", weight: 1.5, text: "Restraint, I have found, is the difference between a selection and a pile." },
  { judge: "kai", trigger: "repetition", weight: 1.2, text: "So we're committing to the {food} motif. Repetition as a statement. Okay." },
  { judge: "kai", trigger: "repetition", weight: 1, text: "{count} of the same thing reads as texture, not variety. In photos it's just going to look like one big shape." },

  // --- pairings -----------------------------------------------------------
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.8, text: "Now that — {note} — that is almost right." },
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.5, text: "I will allow it. {note}." },
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.2, text: "Somebody has read something. {note}." },
  { judge: "kai", trigger: "pairing-placed", weight: 0.8, text: "Bartholomew is excited about the flavours again. I'm looking at the shapes and the shapes are fine." },

  { judge: "bartholomew", trigger: "clash-placed", weight: 2, text: "No. No. {note}." },
  { judge: "bartholomew", trigger: "clash-placed", weight: 1.8, text: "Those two are touching. {note}. Separate them." },
  { judge: "bartholomew", trigger: "clash-placed", weight: 1.5, text: "I want it on the record that {note}." },
  { judge: "kai", trigger: "clash-placed", weight: 0.7, text: "He's upset about something invisible again. Visually? Those two colours are working." },

  // --- spend --------------------------------------------------------------
  { judge: "bartholomew", trigger: "spend-milestone", weight: 1.5, text: "${spend}. And this is what we have to show for it." },
  { judge: "bartholomew", trigger: "spend-milestone", weight: 1.2, text: "We have passed ${spend}. I do hope there is a plan." },
  { judge: "kai", trigger: "spend-milestone", weight: 1.2, text: "${spend} and honestly? It doesn't read as ${spend}. It needs to *read* expensive." },
  { judge: "kai", trigger: "spend-milestone", weight: 1, text: "Money spent: ${spend}. Vibes purchased: unclear." },

  // --- board state --------------------------------------------------------
  { judge: "kai", trigger: "board-empty-ish", weight: 1.4, text: "There is so much wood showing. So much. It's giving unfinished." },
  { judge: "kai", trigger: "board-empty-ish", weight: 1.2, text: "Negative space is a technique, not an excuse." },
  { judge: "kai", trigger: "board-crowded", weight: 1.4, text: "Okay it's getting busy. Busy isn't abundant. Busy is just busy." },
  { judge: "kai", trigger: "board-crowded", weight: 1.2, text: "I can't see the board anymore. The board was doing a lot of the work." },
  { judge: "bartholomew", trigger: "board-crowded", weight: 1, text: "Everything is touching everything. Nothing is being tasted, only encountered." },

  // Fires once per category, so this pool needs at least five distinct lines
  // or a long session will start repeating itself.
  { judge: "kai", trigger: "category-new", weight: 1, text: "Ooh, new colour. That's actually — no, that's good. That's a good colour." },
  { judge: "kai", trigger: "category-new", weight: 1, text: "Finally, something that isn't the same shape as everything else." },
  { judge: "kai", trigger: "category-new", weight: 0.9, text: "New texture. The board just got a second dimension." },
  { judge: "kai", trigger: "category-new", weight: 0.8, text: "{food} brings something the palette was missing. I said what I said." },
  { judge: "bartholomew", trigger: "category-new", weight: 1, text: "A new category appears. Progress, of a sort." },
  { judge: "bartholomew", trigger: "category-new", weight: 1, text: "Ah. Breadth. I had begun to worry." },
  { judge: "bartholomew", trigger: "category-new", weight: 0.9, text: "{food}. That is a gap closed. There remain others." },
  { judge: "bartholomew", trigger: "category-new", weight: 0.8, text: "A board needs range. This is range, technically." },

  // --- idle heckling ------------------------------------------------------
  { judge: "kai", trigger: "idle", weight: 1, text: "Take your time. The light isn't going anywhere. The light is, actually, but take your time." },
  { judge: "kai", trigger: "idle", weight: 1, text: "Are we done? Is this the board? I need to know whether to start composing the caption." },
  { judge: "kai", trigger: "idle", weight: 0.8, text: "I'm just going to say it: it needs one more thing on the left." },
  { judge: "bartholomew", trigger: "idle", weight: 1, text: "We are waiting. The cheese is coming to room temperature. That, at least, is progress." },
  { judge: "bartholomew", trigger: "idle", weight: 1, text: "Hesitation. Interesting. Usually a sign that one knows something is wrong." },
  { judge: "bartholomew", trigger: "idle", weight: 0.8, text: "In Modena I once waited two hours for a board. It was worth it. This is not Modena." },
  { judge: "kai", trigger: "idle", weight: 0.9, text: "Still nothing? Okay. The silence is also a statement." },
  { judge: "kai", trigger: "idle", weight: 0.8, text: "I've mentally cropped this four different ways and none of them save it." },
  { judge: "kai", trigger: "idle", weight: 0.7, text: "Whatever you're about to do, do it on the diagonal." },
  { judge: "kai", trigger: "idle", weight: 0.6, text: "Genuinely asking — is the empty corner intentional?" },
  { judge: "bartholomew", trigger: "idle", weight: 0.9, text: "Deliberation. I approve of deliberation. I do not approve of this much of it." },
  { judge: "bartholomew", trigger: "idle", weight: 0.8, text: "There is still time to remove something. There is always time to remove something." },
  { judge: "bartholomew", trigger: "idle", weight: 0.7, text: "One more item will not fix it. One fewer might." },
  { judge: "bartholomew", trigger: "idle", weight: 0.6, text: "Somewhere a cheese is warming to exactly the right temperature, and it is not on this board." },
];

/** Score bands for the final verdict, per judge. */
export interface Verdict {
  min: number;
  headline: string;
  body: string;
}

export const KAI_VERDICTS: Verdict[] = [
  {
    min: 85,
    headline: "Okay, I'm obsessed.",
    body: "The colour story is doing exactly what it needs to, there's height, there's flow, and I would post this without a filter. I'm as surprised as you are.",
  },
  {
    min: 68,
    headline: "It photographs.",
    body: "It's not going to change anyone's life but it photographs, and honestly at a party that's the whole job. Tighten the composition and we're talking.",
  },
  {
    min: 48,
    headline: "It's fine. It's a board.",
    body: "Food is on it. That's true. It's giving 'someone had ten minutes', and the ten minutes are visible in every square inch of this thing.",
  },
  {
    min: 28,
    headline: "This is a plate of things.",
    body: "There's no rhythm, no colour story, and my eye has nowhere to go. It just sort of falls off the side and gives up. Like some of the food did.",
  },
  {
    min: 0,
    headline: "I don't know what I'm looking at.",
    body: "Genuinely. I've been staring at it and it isn't resolving. It's not ugly exactly, it's just — nothing. It's a void with snacks near it.",
  },
];

export const BARTHOLOMEW_VERDICTS: Verdict[] = [
  {
    min: 85,
    headline: "I am, reluctantly, impressed.",
    body: "The pairings are considered, the balance is correct, and nothing here insults anything else. I would eat this. I would not say so aloud, but I would eat it.",
  },
  {
    min: 68,
    headline: "Competent. Nearly thoughtful.",
    body: "There is evidence of intent. A few choices I would reverse, one I would remove entirely, but the fundamentals hold. That is more than most manage.",
  },
  {
    min: 48,
    headline: "Assembled, not composed.",
    body: "Things have been placed near other things. Occasionally those things agree. More often they simply coexist, politely, waiting for it to be over.",
  },
  {
    min: 28,
    headline: "I have concerns. Several.",
    body: "Flavours are fighting. Categories are missing. Somewhere on this board two items are touching that should never have been introduced.",
  },
  {
    min: 0,
    headline: "This is an act of aggression.",
    body: "I have eaten from bins with more coherence. Every pairing here is either an accident or a provocation, and I am no longer certain which would be worse.",
  },
];

export function verdictFor(verdicts: Verdict[], score: number): Verdict {
  return verdicts.find((v) => score >= v.min) ?? verdicts[verdicts.length - 1];
}

export const JUDGE_NAMES: Record<Judge, string> = {
  kai: "Kai",
  bartholomew: "Bartholomew",
};

export const JUDGE_TITLES: Record<Judge, string> = {
  kai: "on presentation",
  bartholomew: "on the food",
};
