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
  { judge: "kai", trigger: "first-item", weight: 0.9, text: "One {food}, centre-ish. We're establishing an anchor. I respect the intent." },
  { judge: "bartholomew", trigger: "first-item", weight: 0.9, text: "The first choice is the only one made freely. Every other is a consequence of it." },
  { judge: "kai", trigger: "first-item", weight: 0.8, text: "Okay so that's the hero object. Everything else is now supporting cast. No pressure." },
  { judge: "bartholomew", trigger: "first-item", weight: 0.8, text: "One begins with {food}. One could have begun worse. One could also have begun better." },

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
  { judge: "kai", trigger: "item-placed", weight: 0.6, text: "That's going to read as clutter in a wide shot. Just so you know going in." },
  { judge: "kai", trigger: "item-placed", weight: 0.5, text: "The {food} is competing with something and I don't think it's winning." },
  { judge: "kai", trigger: "item-placed", weight: 0.5, text: "Nice. Nothing's happening in the top corner, but nice." },
  { judge: "kai", trigger: "item-placed", weight: 0.4, text: "We've got shape, we've got colour, we do not yet have a reason." },
  { judge: "kai", trigger: "item-placed", weight: 0.4, text: "I'm watching the silhouette and the silhouette is getting lumpy." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.6, text: "{food}. One assumes there is a plan. One assumes a great deal, in this job." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.5, text: "Placed. Not, I think, positioned. There is a distinction and it matters." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.5, text: "The {food} neither helps nor harms. That is not the compliment it sounds like." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.4, text: "Another item. The question was never quantity." },
  { judge: "bartholomew", trigger: "item-placed", weight: 0.4, text: "I have seen {food} do remarkable things. Not here. Not yet." },

  // --- casualties ---------------------------------------------------------
  { judge: "kai", trigger: "item-fell", weight: 1.6, text: "It's on the floor. That's a choice. That's a whole choice." },
  { judge: "kai", trigger: "item-fell", weight: 1.4, text: "The {food} has left the composition entirely. Honestly? Cleaner without it." },
  { judge: "kai", trigger: "item-fell", weight: 1.2, text: "We're losing pieces off the edge and I am simply watching it happen." },
  { judge: "bartholomew", trigger: "item-fell", weight: 1.5, text: "That {food} is on the floor. Where I come from, that is called waste." },
  { judge: "bartholomew", trigger: "item-fell", weight: 1.3, text: "You have paid for that {food}. It is now decor for the tiles." },
  { judge: "kai", trigger: "item-fell", weight: 1.1, text: "And it's gone. Off the edge. I'm choosing to read that as negative space." },
  { judge: "bartholomew", trigger: "item-fell", weight: 1.1, text: "The board has rejected the {food}. I find I agree with the board." },
  { judge: "kai", trigger: "item-fell", weight: 1, text: "Okay, so we're just losing food now. That's the phase we're in." },
  { judge: "bartholomew", trigger: "item-fell", weight: 1, text: "Gravity has opinions about your placement. Gravity is rarely wrong." },

  // --- repetition ---------------------------------------------------------
  { judge: "bartholomew", trigger: "repetition", weight: 2, text: "{count} of them. {count}. At what point does this stop being a board and start being an intervention?" },
  { judge: "bartholomew", trigger: "repetition", weight: 1.8, text: "That is the {count}th {food}. I am counting. I will keep counting." },
  { judge: "bartholomew", trigger: "repetition", weight: 1.5, text: "Restraint, I have found, is the difference between a selection and a pile." },
  { judge: "kai", trigger: "repetition", weight: 1.2, text: "So we're committing to the {food} motif. Repetition as a statement. Okay." },
  { judge: "kai", trigger: "repetition", weight: 1, text: "{count} of the same thing reads as texture, not variety. In photos it's just going to look like one big shape." },
  { judge: "bartholomew", trigger: "repetition", weight: 1.3, text: "{count}. One begins to suspect this is not a preference but a limitation." },
  { judge: "kai", trigger: "repetition", weight: 0.9, text: "At {count} it stops being a choice and starts being a pattern. Patterns are fine. This one is flat." },

  // --- pairings -----------------------------------------------------------
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.8, text: "Now that — {note} — that is almost right." },
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.5, text: "I will allow it. {note}." },
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.2, text: "Somebody has read something. {note}." },
  { judge: "kai", trigger: "pairing-placed", weight: 0.8, text: "Bartholomew is excited about the flavours again. I'm looking at the shapes and the shapes are fine." },
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.4, text: "There. {note}. That is what the whole exercise is for." },
  { judge: "bartholomew", trigger: "pairing-placed", weight: 1.1, text: "Correct. {note}. I shall not pretend I expected it." },
  { judge: "kai", trigger: "pairing-placed", weight: 0.6, text: "He's happy. That happens roughly twice a year, so enjoy it." },

  { judge: "bartholomew", trigger: "clash-placed", weight: 2, text: "No. No. {note}." },
  { judge: "bartholomew", trigger: "clash-placed", weight: 1.8, text: "Those two are touching. {note}. Separate them." },
  { judge: "bartholomew", trigger: "clash-placed", weight: 1.5, text: "I want it on the record that {note}." },
  { judge: "kai", trigger: "clash-placed", weight: 0.7, text: "He's upset about something invisible again. Visually? Those two colours are working." },
  { judge: "bartholomew", trigger: "clash-placed", weight: 1.6, text: "{note}. I would like that undone, please. Now, ideally." },
  { judge: "bartholomew", trigger: "clash-placed", weight: 1.3, text: "Somebody has put those together deliberately. {note}. Deliberately." },
  { judge: "kai", trigger: "clash-placed", weight: 0.6, text: "Whatever he's shouting about, it photographs beautifully. Just saying." },

  // --- spend --------------------------------------------------------------
  { judge: "bartholomew", trigger: "spend-milestone", weight: 1.5, text: "${spend}. And this is what we have to show for it." },
  { judge: "bartholomew", trigger: "spend-milestone", weight: 1.2, text: "We have passed ${spend}. I do hope there is a plan." },
  { judge: "kai", trigger: "spend-milestone", weight: 1.2, text: "${spend} and honestly? It doesn't read as ${spend}. It needs to *read* expensive." },
  { judge: "kai", trigger: "spend-milestone", weight: 1, text: "Money spent: ${spend}. Vibes purchased: unclear." },
  { judge: "bartholomew", trigger: "spend-milestone", weight: 1.1, text: "${spend}. Expenditure is not the same as judgement, though they are often confused." },
  { judge: "kai", trigger: "spend-milestone", weight: 0.9, text: "${spend}. For that I'd want at least one thing on this board to be doing something." },
  { judge: "bartholomew", trigger: "spend-milestone", weight: 0.9, text: "We are at ${spend} and I have yet to see the idea that justifies the first dollar of it." },

  // --- board state --------------------------------------------------------
  { judge: "kai", trigger: "board-empty-ish", weight: 1.4, text: "There is so much wood showing. So much. It's giving unfinished." },
  { judge: "kai", trigger: "board-empty-ish", weight: 1.2, text: "Negative space is a technique, not an excuse." },
  { judge: "kai", trigger: "board-crowded", weight: 1.4, text: "Okay it's getting busy. Busy isn't abundant. Busy is just busy." },
  { judge: "kai", trigger: "board-crowded", weight: 1.2, text: "I can't see the board anymore. The board was doing a lot of the work." },
  { judge: "bartholomew", trigger: "board-crowded", weight: 1, text: "Everything is touching everything. Nothing is being tasted, only encountered." },
  { judge: "kai", trigger: "board-empty-ish", weight: 1, text: "It's very sparse. Sparse can be a choice. I'm not convinced this one is." },
  { judge: "bartholomew", trigger: "board-empty-ish", weight: 1.1, text: "A board this bare is either restraint or an unfinished thought. I know which I am looking at." },
  { judge: "kai", trigger: "board-crowded", weight: 1, text: "There's no breathing room left. The eye needs somewhere to rest and you've booked every seat." },
  { judge: "bartholomew", trigger: "board-crowded", weight: 0.9, text: "Abundance and excess are separated by roughly four items, and we passed them some time ago." },

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
  { judge: "kai", trigger: "category-new", weight: 0.7, text: "Okay, that's a different shape language entirely. The board just woke up a bit." },
  { judge: "bartholomew", trigger: "category-new", weight: 0.7, text: "Something genuinely new. I withdraw one of my objections. One." },

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
  { judge: "kai", trigger: "idle", weight: 0.7, text: "We could call it finished. I'm not saying we should. I'm saying we could." },
  { judge: "bartholomew", trigger: "idle", weight: 0.7, text: "Take the time. Rushing produced most of what is already wrong here." },
  { judge: "kai", trigger: "idle", weight: 0.6, text: "The board isn't going to compose itself. I've waited. I've checked." },
  { judge: "bartholomew", trigger: "idle", weight: 0.6, text: "Silence. Either contemplation or defeat, and the board suggests one of them." },
];

/** One way of delivering a band's verdict. */
export interface VerdictText {
  headline: string;
  body: string;
}

/**
 * Score bands for the final verdict, per judge.
 *
 * Each band carries several phrasings. A band used to hold exactly one, which
 * meant every board in the same twenty-point range was judged in identical
 * words — the fastest way to make a comedy game stop being funny.
 */
export interface Verdict {
  min: number;
  variants: VerdictText[];
}

export const KAI_VERDICTS: Verdict[] = [
  {
    min: 85,
    variants: [
      {
        headline: "Okay, I'm obsessed.",
        body: "The colour story is doing exactly what it needs to, there's height, there's flow, and I would post this without a filter. I'm as surprised as you are.",
      },
      {
        headline: "This is the one.",
        body: "Colour, height, flow — it's all doing the thing at once. I'd shoot this from three angles and use all three. Do not touch it. Do not add one more olive.",
      },
      {
        headline: "I have no notes.",
        body: "I went looking for something to criticise and came back with nothing. The palette is considered, the spacing is confident, and it holds up from every angle I tried.",
      },
      {
        headline: "Genuinely stunning.",
        body: "There's a rhythm here most people never find. The eye enters, it travels, it rests. I'm going to be thinking about this board later, which is not something I say.",
      },
    ],
  },
  {
    min: 68,
    variants: [
      {
        headline: "It photographs.",
        body: "It's not going to change anyone's life but it photographs, and honestly at a party that's the whole job. Tighten the composition and we're talking.",
      },
      {
        headline: "Nearly there.",
        body: "The bones are good. There's a real composition happening — it just hasn't been tightened. A couple of things are sitting where they landed rather than where they belong.",
      },
      {
        headline: "Solid. Safe.",
        body: "It works. It's balanced, it's readable, and nobody is going to say anything unkind about it. I just wish it took one risk. One.",
      },
      {
        headline: "Good from this angle.",
        body: "From here it's genuinely nice. From the other side there's a gap I can't unsee. Half a great board is still, unfortunately, half a board.",
      },
    ],
  },
  {
    min: 48,
    variants: [
      {
        headline: "It's fine. It's a board.",
        body: "Food is on it. That's true. It's giving 'someone had ten minutes', and the ten minutes are visible in every square inch of this thing.",
      },
      {
        headline: "It's giving assembled.",
        body: "Not composed. Assembled. Everything is technically present and nothing is talking to anything else. The wood is doing more work than the food is.",
      },
      {
        headline: "I could crop this.",
        body: "With a tight enough crop and a forgiving angle there's a picture in here somewhere. That's not a compliment. That's a rescue.",
      },
      {
        headline: "Some of this is working.",
        body: "There are two or three moments I like and a lot of nothing between them. It reads as unfinished rather than minimal, and those are very different things.",
      },
    ],
  },
  {
    min: 28,
    variants: [
      {
        headline: "This is a plate of things.",
        body: "There's no rhythm, no colour story, and my eye has nowhere to go. It just sort of falls off the side and gives up. Like some of the food did.",
      },
      {
        headline: "My eye has nowhere to go.",
        body: "It enters, it panics, it leaves. No anchor, no path, no hierarchy — just objects of roughly one size sitting in roughly one place.",
      },
      {
        headline: "Structurally, no.",
        body: "The colour is muddy, the heights are identical, and the whole thing sits in a single flat plane. It's a board-shaped absence of decisions.",
      },
      {
        headline: "This would not survive a photo.",
        body: "I've tried every angle in my head and none of them save it. The light isn't the problem. The board isn't the problem. I think we both know.",
      },
    ],
  },
  {
    min: 0,
    variants: [
      {
        headline: "I don't know what I'm looking at.",
        body: "Genuinely. I've been staring at it and it isn't resolving. It's not ugly exactly, it's just — nothing. It's a void with snacks near it.",
      },
      {
        headline: "This is hostile.",
        body: "To the eye, specifically. Nothing is where it should be, several things are where nothing should be, and the empty space has taken the whole thing over.",
      },
      {
        headline: "No.",
        body: "I want to be constructive. I've been sitting here looking for the constructive thing to say. What I have is: no.",
      },
      {
        headline: "It's a texture study.",
        body: "That's the kindest reading available. One colour, one height, one shape, reading as a single indistinct mass with a wooden border around it.",
      },
    ],
  },
];

export const BARTHOLOMEW_VERDICTS: Verdict[] = [
  {
    min: 85,
    variants: [
      {
        headline: "I am, reluctantly, impressed.",
        body: "The pairings are considered, the balance is correct, and nothing here insults anything else. I would eat this. I would not say so aloud, but I would eat it.",
      },
      {
        headline: "Correct. Genuinely correct.",
        body: "The pairings hold, the balance is deliberate, and there is not one item I would remove. I have said that perhaps eleven times in my career.",
      },
      {
        headline: "Somebody has been taught.",
        body: "Or has read properly, and understood. The fundamentals are right and the flourishes are earned. I have no complaint, which is itself a complaint about my afternoon.",
      },
      {
        headline: "This is a board.",
        body: "Not an arrangement. Not a display. A board, in the sense the word is meant. Salt, fat, acid and sweet all accounted for, and not one of them shouting.",
      },
    ],
  },
  {
    min: 68,
    variants: [
      {
        headline: "Competent. Nearly thoughtful.",
        body: "There is evidence of intent. A few choices I would reverse, one I would remove entirely, but the fundamentals hold. That is more than most manage.",
      },
      {
        headline: "Sound, with lapses.",
        body: "The structure is correct and most of these choices defend themselves. One or two do not, and I suspect you know precisely which. Remove them and this becomes something.",
      },
      {
        headline: "I would eat this without complaint.",
        body: "Which from me you should take as praise. It is not exciting. It does not need to be — most boards fail long before they arrive at the question of excitement.",
      },
      {
        headline: "Nearly. Genuinely nearly.",
        body: "The range is there and the pairings are mostly considered. What is missing is the last edit: the willingness to take one thing away again.",
      },
    ],
  },
  {
    min: 48,
    variants: [
      {
        headline: "Assembled, not composed.",
        body: "Things have been placed near other things. Occasionally those things agree. More often they simply coexist, politely, waiting for it to be over.",
      },
      {
        headline: "It is food. It is on a board.",
        body: "Beyond that I struggle. Nothing here is wrong, exactly. Nothing here was decided, either. The selection reads as whatever happened to be nearest.",
      },
      {
        headline: "Adequate, and no more.",
        body: "There is enough to eat and enough variety to avoid boredom. There is not enough thought to avoid indifference, which is by some distance the worse fate.",
      },
      {
        headline: "I have questions.",
        body: "Chiefly: what was the intention? A board should answer that in the first glance. This one asks me to guess, and my guesses are not generous.",
      },
    ],
  },
  {
    min: 28,
    variants: [
      {
        headline: "I have concerns. Several.",
        body: "Flavours are fighting. Categories are missing. Somewhere on this board two items are touching that should never have been introduced.",
      },
      {
        headline: "This needs undoing.",
        body: "Not adding to. Undoing. There are pairings here working actively against each other and a gap where a whole category ought to sit. Begin by removing.",
      },
      {
        headline: "Somebody was in a hurry.",
        body: "It shows in every choice. Things have been put down rather than placed, and the few that landed well did so by accident. Accident is not a technique.",
      },
      {
        headline: "The fundamentals are missing.",
        body: "Salt without acid, fat without relief, and a category absent altogether. Each of those is survivable alone. Together they are not.",
      },
    ],
  },
  {
    min: 0,
    variants: [
      {
        headline: "This is an act of aggression.",
        body: "I have eaten from bins with more coherence. Every pairing here is either an accident or a provocation, and I am no longer certain which would be worse.",
      },
      {
        headline: "I decline.",
        body: "Not to judge — I have judged it, and the judgement is poor. I decline to eat it. There is a difference between a board and a warning, and this is the latter.",
      },
      {
        headline: "Explain yourself.",
        body: "I have looked for the reasoning and there is none. Items that should never meet are touching, items that belong together sit in opposite corners.",
      },
      {
        headline: "In Modena this would be a scandal.",
        body: "Here it is merely a Tuesday. Every principle governing a board has been either ignored or actively inverted, and I cannot say which is the greater insult.",
      },
    ],
  },
];

/**
 * The band a score falls in, and which phrasing of it to use.
 *
 * `variant` is an index, not a random number: the caller derives it from the
 * board so that judging the same board twice says the same thing. Re-pressing
 * Serve and getting a different verdict would read as the game changing its
 * mind rather than as variety.
 */
export function verdictFor(
  verdicts: Verdict[],
  score: number,
  variant = 0,
): VerdictText {
  const band =
    verdicts.find((v) => score >= v.min) ?? verdicts[verdicts.length - 1];
  const i = Math.abs(Math.trunc(variant)) % band.variants.length;
  return band.variants[i];
}

export const JUDGE_NAMES: Record<Judge, string> = {
  kai: "Kai",
  bartholomew: "Bartholomew",
};

export const JUDGE_TITLES: Record<Judge, string> = {
  kai: "on presentation",
  bartholomew: "on the food",
};
