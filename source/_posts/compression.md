---
title: Compression is Intelligence, One Bit at a Time
date: 2026-11-19 20:00:00
tags:
  - compression
  - information theory
  - arithmetic coding
  - AIXI
---

<link rel="stylesheet" href="{% asset_path compression.css %}">

<div class="cz cz-banner">
<p class="k">Arithmetic coding · the Hutter Prize · Solomonoff · AIXI</p>
<p class="d">How a number line turns any predictor into a compressor, why someone would pay half a million euros for a smaller Wikipedia, and what that has to do with a mathematical definition of intelligence. With a compressor you can teach yourself, at the end.</p>
<div class="b">0.0111010011010001011011100110101001100010110100101110010011010110001110100111001011</div>
</div>

I love the moment when a single picture makes an idea click into place. It happened to me this week, watching Grant Sanderson's new 3Blue1Brown video, [*How to compress text to 1 bit per character*](https://www.youtube.com/watch?v=qbsb9DpdZ6s). It's the last part of his series *Compression is Intelligence*. [Part 1](https://www.3blue1brown.com/lessons/entropy/) rebuilt Shannon's entropy from scratch, and [Part 2](https://www.3blue1brown.com/lessons/cross-entropy/) explained cross-entropy.

The third video is about arithmetic coding, a way to turn any model that predicts text into a compressor for text. That can sound like a technical detail. But I've come to think it's one of those ideas that, once you really see it, changes how you look at a lot of other things: why we train language models the way we do, why someone would offer half a million euros for shrinking Wikipedia, and why some people believe the best definition of intelligence we have is, underneath, a definition of compression.

This post is my attempt to follow that thread. At the end there's a small compressor you can teach with your own text, and a decoder to get your text back.

<!-- more -->

## Prediction is Compression

Let's start with a game. I want to send you a message, one character at a time, and before we begin we agree on a model: something that, given the text so far, says how likely each possible next character is. We each have an identical copy.

Here's the trick. Picture the interval from 0 to 1. Before the first character, the model gives a probability to every possible letter, and we cut the interval into slices of exactly those sizes. The first letter turns out to be T, so we zoom into T's slice. Then we ask the model about the second letter, now that it knows the first was T, and cut *that* slice up in the same way. And so on, zooming in once per character.

<div class="cz cz-figure">
<div class="wrap"><svg viewBox="0 0 720 250" role="img" aria-label="Three rows of nested intervals. The slice for T takes 16 percent of the first row, H takes 55 percent of the zoomed T slice, and E takes 70 percent of the zoomed TH slice. The interval width falls to 0.062, which takes about 4 bits to point at.">
<text class="lbl" x="0" y="14">Interval</text>
<text class="lbl" x="580" y="14">width · bits so far</text>
<g transform="translate(0,24)">
<rect x="0" y="0" width="44.8" height="36" rx="3" fill="var(--cz-seg)"/><text x="22.4" y="23" text-anchor="middle">A</text>
<rect x="46.8" y="0" width="300.4" height="36" rx="3" fill="var(--cz-seg-2)"/><text x="197" y="23" text-anchor="middle">B … S</text>
<rect x="349.2" y="0" width="87.6" height="36" rx="3" fill="var(--cz-accent)"/><text x="393" y="23" text-anchor="middle" style="fill:var(--cz-accent-ink)">T</text>
<rect x="438.8" y="0" width="121.2" height="36" rx="3" fill="var(--cz-seg)"/><text x="499" y="23" text-anchor="middle">U … Z, ␣</text>
<text x="580" y="23">0.16 · 2.6 bits</text>
</g>
<path d="M349.2 60 L436.8 60 L560 98 L0 98 Z" fill="var(--cz-accent-soft)"/>
<g transform="translate(0,98)">
<rect x="0" y="0" width="70.8" height="36" rx="3" fill="var(--cz-seg)"/><text x="35.4" y="23" text-anchor="middle">A</text>
<rect x="72.8" y="0" width="65.2" height="36" rx="3" fill="var(--cz-seg-2)"/><text x="105" y="23" text-anchor="middle">E</text>
<rect x="140" y="0" width="306" height="36" rx="3" fill="var(--cz-accent)"/><text x="293" y="23" text-anchor="middle" style="fill:var(--cz-accent-ink)">H  (given T)</text>
<rect x="448" y="0" width="112" height="36" rx="3" fill="var(--cz-seg)"/><text x="504" y="23" text-anchor="middle">I … ␣</text>
<text x="580" y="23">0.088 · 3.5 bits</text>
</g>
<path d="M140 134 L446 134 L560 172 L0 172 Z" fill="var(--cz-accent-soft)"/>
<g transform="translate(0,172)">
<rect x="0" y="0" width="42.8" height="36" rx="3" fill="var(--cz-seg)"/><text x="21.4" y="23" text-anchor="middle">A</text>
<rect x="44.8" y="0" width="390" height="36" rx="3" fill="var(--cz-accent)"/><text x="240" y="23" text-anchor="middle" style="fill:var(--cz-accent-ink)">E  (given TH)</text>
<rect x="436.8" y="0" width="65.2" height="36" rx="3" fill="var(--cz-seg-2)"/><text x="469" y="23" text-anchor="middle">I</text>
<rect x="504" y="0" width="56" height="36" rx="3" fill="var(--cz-seg)"/><text x="532" y="23" text-anchor="middle">…</text>
<text x="580" y="23">0.062 · 4.0 bits</text>
</g>
<text class="lbl" x="0" y="242">0</text><text class="lbl" x="560" y="242" text-anchor="end">1</text>
</svg></div>
<div class="cap">Coding “THE” with made-up probabilities. Each row zooms into the slice the previous character picked. The widths multiply: 0.16 × 0.55 × 0.70 ≈ 0.062, and −log₂ 0.062 ≈ 4 bits for three letters.</div>
</div>

When the message is over, we're left holding a tiny interval. How tiny? Its width is the product of the probabilities the model gave to each character that actually came. To tell you where it is, I only need to send enough binary digits to name some number inside it, which takes about −log₂(width) bits. On your end, you run the same model, cut the same slices, and check which slice my number falls into, character after character, until you've rebuilt the message exactly.

I find something really beautiful here. Each character costs −log₂ *p* bits, where *p* is the probability the model gave it. A character the model expected is almost free; a surprising one is expensive. Add those costs up and you get the length of the compressed file. But that sum is also exactly the cross-entropy loss we train language models with.<sup><a href="#cz-fn1" id="cz-ref1">1</a></sup> So a language model that does well on its training objective *is* a good compressor, and the number on its loss curve is a file size in disguise.

Let's make this concrete. The model below is a *lookup model*. It has 1.1 million characters of Shakespeare, and for each next character it looks up which letters followed the last few characters in that text, and how often, and turns those counts into probabilities. Type anything you like, or start from one of the examples. At the bottom is the picture from above, drawn for real: each row is the model slicing up the interval for one character, and the highlighted slice is the one we zoom into. Click any character to see what the model expected there.

<div class="cz cz-try" id="cz-try">
<div class="cz-card">
<h4>Try it</h4>
<div class="samples"><span class="lbl">Try:</span><button type="button" data-sample="richard">Richard III (in the corpus)</button><button type="button" data-sample="sonnet">Sonnet 18 (not in the corpus)</button><button type="button" data-sample="modern">Modern English</button><button type="button" data-sample="repeat">A repeated line</button><button type="button" data-sample="mash">Keyboard mash</button></div>
<textarea id="cz-lInput" spellcheck="false" aria-label="Text to compress"></textarea>
<div class="status" id="cz-lClean"></div>
<fieldset class="engines"><legend>Compressor</legend>
<label class="eng"><input type="radio" name="cz-engine" value="lookup" checked><span><b>Lookup model</b><small>Looks up every context in the Shakespeare corpus. The 1.1 MB corpus sits in the decoder and is not counted.</small></span></label>
<label class="eng"><input type="radio" name="cz-engine" value="warm"><span><b>Bard, after reading Shakespeare <span class="pill" id="cz-lWarmPill">waiting…</span></b><small>Started empty, read the whole corpus while compressing it, and paid for every bit. <span id="cz-lWarmCost"></span></small><span class="eprog" aria-hidden="true"><span id="cz-lWarmBar"></span></span></span></label>
</fieldset>
<div class="controls" id="cz-lControls">
<div class="control"><div class="rowsb"><label for="cz-lOrder">Lookup model: context length</label><span class="order-val" id="cz-lOrderVal">10 characters</span></div><input type="range" id="cz-lOrder" min="0" max="24" step="1" value="10"><div class="hint">0 = letter frequencies only. Short contexts generalise; long contexts start reciting lines the model has seen.</div></div>
<div class="check"><input type="checkbox" id="cz-lAdaptive"><label for="cz-lAdaptive">Learn as you go <span class="hint">(sender and receiver both add each character to the model, so repeats get cheap)</span></label></div>
</div>
<div class="tiles">
<div class="tile"><div class="k">Characters</div><div class="v" id="cz-lChars">0</div></div>
<div class="tile"><div class="k">Bits sent</div><div class="v" id="cz-lBitsN">0</div></div>
<div class="tile hero"><div class="k">Bits per character</div><div class="v" id="cz-lBpc">0</div></div>
<div class="tile"><div class="k">Smaller than ASCII by</div><div class="v" id="cz-lRatio">0</div></div>
</div>
<div class="bars" id="cz-lBars"></div>
<div class="honest" id="cz-lHonest"></div>
<div class="status" id="cz-lStatus">The model loads when you scroll here.</div>
<h4 class="sp">The number that gets sent</h4>
<div class="bitsbox" id="cz-lBits"><span class="pt">0.</span></div>
<h4 class="sp">Cost of each character</h4>
<div class="heat" id="cz-lHeat"></div>
<div class="legend"><span>0 bits</span><span class="ramp" id="cz-lRamp"></span><span>8+ bits</span><span>· Click a character to inspect it.</span><span id="cz-lHeatNote"></span></div>
<h4 class="sp">What the lookup model predicted</h4>
<div class="detail" id="cz-lDetail"></div>
<h4 class="sp">Zooming into the interval</h4>
<div class="ladder-wrap"><canvas id="cz-lLadder" height="300" aria-label="Nested intervals for the selected characters"></canvas></div>
</div>
</div>

It's worth trying the two Shakespeare samples one after the other. The opening of Richard III is in the corpus, so as you lengthen the context the lookup model simply recites it, falling well under a bit per character. Sonnet 18 isn't in the corpus, and it never gets below about two bits per character, however long you make the context, because there's nothing to recite. The keyboard mash is the strangest of all: with any context it costs more than plain ASCII, because the model is confidently wrong about every letter.

That gap between reciting and predicting is something we'll come back to. Memorising isn't the same as understanding, and the lookup model carries its whole library in the decoder for free. Bard is different: it started knowing nothing and earned its knowledge of Shakespeare by compressing all of it, and the price it paid is printed under its name. Knowledge costs bits once, and then makes every later message cheaper.

At the end of the video, Grant points out three things good compression rewards. Each looks a lot like something we'd call intelligence:

<div class="cz cz-three">
<div><b>Predicting well</b>Every bit saved is probability placed on what actually happens next.</div>
<div><b>Few assumptions</b>A compact explanation beats a pile of memorised facts, because the explanation is cheaper to carry.</div>
<div><b>Learning fast</b>A model that catches on after a few pages pays far less than one that needs a library.</div>
</div>

It's worth holding on to these three, because they're going to show up again in two very different places: a contest with real money, and a definition of intelligence written in mathematics.

## A Prize Paid in Bytes

If compression measures understanding, you can try to turn it into a benchmark. That's exactly what Marcus Hutter did. In 2006 he put up 50,000 € for compressing the first 100 MB of English Wikipedia, a file called enwik8. In February 2020 he scaled both numbers by ten: the file became the first billion bytes, enwik9, and the fund became 500,000 €. He runs the prize with Matt Mahoney and Jim Bowery.

The rules are short and strict. You hand in a compressor and a self-extracting archive, and their sizes are added together. The archive has to rebuild enwik9 bit for bit, on a single CPU core, in about 50 hours, with less than 10 GB of memory and no GPU. A new record pays 500,000 € × (1 − *S*/*L*), where *S* is your total and *L* is the previous record. Each 1% is worth 5,000 €, and anything under 1% wins nothing.

The rule I keep coming back to is the one that counts the decompressor. Without it, you could hide Wikipedia inside the program and "compress" it to nothing. With it, whatever your model knows before it starts has to be paid for, byte by byte. What you're really looking for is the shortest description of everything at once: the data and the model together.

| Record holder | Date | Program | Total bytes | Gain | Award |
|---|---|---|--:|--:|--:|
| **Vladimir Ivanov** | **24 Jul 2026** | **fx2-cmix-T** | **100,424,672** | **7.46%** | **37,300 €** |
| David Freelan | 19 Jul 2026 | cmix-obias | 108,521,870 | 1.05% | 5,240 € |
| Ibrahim Marcouch & Kaido Orav | 26 Jun 2026 | cmix-lex | 109,671,639 | 1.01% | 5,050 € |
| Kaido Orav & Byron Knoll | 3 Sep 2024 | fx2-cmix | 110,793,128 | 1.59% | 7,950 € |
| Kaido Orav | 2 Feb 2024 | fx-cmix | 112,578,322 | 1.38% | 6,911 € |
| Saurabh Kumar | 16 Jul 2023 | fast cmix | 114,156,155 | 1.04% | 5,187 € |
| Artemiy Margaritov | 31 May 2021 | starlit | 115,352,938 | 1.10% | 9,000 € |
| Alexander Rhatushnyak | 4 Jul 2019 | phda9v1.8 | 116,673,681 | – | baseline |

For years, progress was slow. Epoch AI counts roughly a 5% improvement from the 2019 baseline up to May 2026. Then June and July of this year brought three records in four weeks, and the total tripled to 15%. The current record, Vladimir Ivanov's fx2-cmix-T, is 100,424,672 bytes. That's about 0.80 bits per character, *including* the decompressor, so Grant's "1 bit per character" has already been beaten here. The next claim has to come in under 99,420,425 bytes, which would be the first entry below 100 MB.

Not everyone thinks the rules point in the right direction. Gwern has argued that charging for model size, the very rule that keeps the contest honest, also shuts out the regime where modern AI actually improves: very large models trained on very large data. I find myself persuaded by both sides. The rule keeps the contest honest, and it also keeps it small.

## The Shortest Program

Why would anyone think a file size captures intelligence? Hutter's own description of the prize ties compressing well to acting intelligently, and calls the contest a way of [reducing "the slippery concept of intelligence to hard file size numbers"](https://www.hutter1.net/ai/ai.htm). To see where that comes from, we need three ideas, each building on the last.

### Kolmogorov complexity

Here's a natural question: how much information is *really* in a string? One answer is the length of the shortest program that prints it, on some fixed universal computer *U*:

<div class="cz cz-math">K(x) <span class="r">=</span> min { ℓ(p) <span class="r">:</span> U(p) <span class="r">=</span> x }</div>

A million digits of π are simple: a short program prints them. A million coin flips are not; the shortest program is basically "print" followed by the flips. In a sense *K* is the ultimate compressor. Unfortunately, it's also incomputable: no algorithm can find the shortest program for every string. Every real compressor, from gzip to fx2-cmix-T, gives us an upper bound on *K*, and the Hutter Prize is, in a way, a race to tighten that bound for one very particular string.

### Solomonoff's universal predictor

In 1964, Ray Solomonoff turned the same idea into a way to predict. Take every program whose output begins with what you've seen so far. Give each one a weight of 2 to the power of minus its length, and add them up. Short programs dominate the sum. It's Occam's razor, written as a probability distribution:

<div class="cz cz-math">M(x) <span class="r">=</span> Σ<sub>p : U(p) = x…</sub> 2<sup>−ℓ(p)</sup> &nbsp;&nbsp;&nbsp;&nbsp; M(x<sub>n+1</sub> | x<sub>1…n</sub>) <span class="r">=</span> M(x<sub>1…n+1</sub>) / M(x<sub>1…n</sub>)<small>Sum over every program that prints something starting with x, each weighted by its length. Predicting the next symbol is a ratio of two such sums.</small></div>

I like to think of *M* as a crowd of every possible explanation, each voting on what comes next, with simpler explanations getting louder voices. Explanations that predicted badly fall silent, because they no longer print what we've seen.

Two facts make this remarkable. First, −log₂ *M*(*x*) is within a constant of *K*(*x*). So if you plugged *M* into the arithmetic coder from the first section, you'd get the ideal compressor: the same number line, with the best possible predictor. Second, if the data comes from *any* computable source, the total of *M*'s prediction errors over an endless sequence is bounded by a constant proportional to the complexity of that source. It learns about as fast as anything can.<sup><a href="#cz-fn2" id="cz-ref2">2</a></sup>

Now look back at Grant's three traits. Predicting well, few assumptions, learning fast. Solomonoff's predictor has all three by construction, and they aren't three separate virtues. They all fall out of a single choice: weight explanations by how short they are.

### From predicting to acting: AIXI

Prediction isn't the whole story, though. An intelligent agent doesn't just watch the world; it acts in it. Around 2000, Hutter took Solomonoff's predictor and put it inside an agent. AIXI acts, observes what happens, receives a reward, and chooses each action to maximise its expected future reward, averaging over every possible environment program, weighted by 2 to the minus its length:

<div class="cz cz-math">a<sub>k</sub> <span class="r">=</span> arg max<sub>a<sub>k</sub></sub> Σ<sub>o<sub>k</sub>r<sub>k</sub></sub> … max<sub>a<sub>m</sub></sub> Σ<sub>o<sub>m</sub>r<sub>m</sub></sub> [r<sub>k</sub> + … + r<sub>m</sub>] Σ<sub>q : U(q, a<sub>1…m</sub>) = o<sub>1</sub>r<sub>1</sub>…o<sub>m</sub>r<sub>m</sub></sub> 2<sup>−ℓ(q)</sup><small>Plan to the horizon m: alternate choosing actions a and averaging over observations o and rewards r. Each environment q that explains the history so far counts with weight 2<sup>−ℓ(q)</sup>.</small></div>

The formula looks intimidating, but it reads naturally from left to right: *pick the action that, averaged over every way the world might respond, and every way you might respond to that, and so on, earns the most reward. Trust each theory of the world in proportion to how short it is.*

Like Solomonoff induction, AIXI is incomputable. It's a definition of the target, not a recipe for building it. I find it touching that Hutter has described working the theory out over a few weekends and then deciding it was too beautiful to be new: he'd rediscovered Kolmogorov complexity and Solomonoff induction. What *was* new was turning them into a universally optimal learning agent.

And now the motivation for the prize comes into focus. AIXI is the ideal. Its engine is a universal predictor. A predictor is a compressor. And a compressor, unlike intelligence, can be measured to the byte. Every byte shaved off enwik9 is a small, checkable step towards that ideal.

## Playing with a Compressor

Reading about this is one thing, but I wanted to *feel* it. So here's Bard, a small compressor. It starts out knowing nothing at all. It reads your file one bit at a time, predicts that bit, pays −log₂ *p* through an arithmetic coder, and then learns from what it just saw. The decoder starts from the same blank state and makes exactly the same updates, so no model is ever sent: the bytes you get really are the whole message. It's the Hutter Prize setting in miniature, minus the 50 hours.<sup><a href="#cz-fn3" id="cz-ref3">3</a></sup>

<div class="cz cz-lab">
<div class="cz-card">
<h4>Encoder</h4>
<label class="drop" id="cz-encDrop" tabindex="0"><input type="file" id="cz-encFile"><div class="big">Drop a text file here</div><div class="small">or click to choose one. Any file works; text compresses best. Up to 10 MB. Nothing leaves your browser.</div></label>
<div class="row"><button type="button" id="cz-usePost">Compress this blog post instead</button><button type="button" id="cz-encCancel" class="hidden">Cancel</button></div>
<div class="progress hidden" id="cz-encProg" aria-hidden="true"><span></span></div>
<div class="status" id="cz-encStatus"></div>
<div id="cz-encResult" class="hidden">
<div class="tiles">
<div class="tile"><div class="k">Original</div><div class="v" id="cz-tOrig">0</div><div class="s" id="cz-tOrigS"></div></div>
<div class="tile"><div class="k">Bard file</div><div class="v" id="cz-tComp">0</div><div class="s" id="cz-tCompS"></div></div>
<div class="tile hero"><div class="k">Bits per byte</div><div class="v" id="cz-tBpb">0</div><div class="s">8 means no savings</div></div>
<div class="tile"><div class="k">Smaller by</div><div class="v" id="cz-tRatio">0</div><div class="s" id="cz-tRatioS"></div></div>
</div>
<div class="bars" id="cz-bars"></div>
<div class="split">
<div>
<h4 class="sp">How fast it learns</h4>
<div class="chartwrap" id="cz-curveWrap"><svg class="curve" id="cz-curve" role="img" aria-label="Bits per byte along the file"></svg><div class="tip" id="cz-curveTip"></div></div>
<p class="status" id="cz-curveNote"></p>
</div>
<div>
<h4>Cost of each character</h4>
<div class="heat" id="cz-heat"></div>
<div class="legend"><span>0 bits</span><span class="ramp" id="cz-ramp"></span><span>8+ bits</span><span id="cz-heatNote"></span></div>
</div>
</div>
<h4 class="sp">The bytes you get</h4>
<div class="keyline"><span><i style="background:var(--cz-accent)"></i>header: “BRD1”, table size, length, checksum, file name</span><span><i style="background:var(--cz-line)"></i>arithmetic-coded payload</span></div>
<div class="hex" id="cz-hex"></div>
<div class="row"><button type="button" class="primary" id="cz-toDecoder">Send to the decoder ↓</button><button type="button" id="cz-saveZip" class="hidden">Save the bytes (.zip)</button><button type="button" id="cz-saveBits" class="hidden">Save the bits (.txt)</button><button type="button" id="cz-copyBits">Copy the bits</button><span class="status" id="cz-saveNote"></span></div>
</div>
</div>
</div>

A few things are worth noticing as you play with it. The learning curve almost always starts high and falls: at the beginning Bard has seen nothing, so every letter is a surprise, and by the end it has picked up your vocabulary, your phrases and your habits. Repeated passages become nearly free, because a part of the model looks for the last time the recent text appeared. And if you feed it a file of random bytes, it can't compress it at all. There's no pattern to learn, and the shortest description of noise is the noise itself.

Then take the bits to the other side. The decoder knows nothing except the bits, and it rebuilds your file exactly. Try flipping a single bit, too. Because every prediction depends on everything decoded so far, the text comes out perfect up to the damaged bit and then dissolves into noise. That's what it means for a message to have no redundancy left.

<div class="cz cz-lab">
<div class="cz-card">
<h4 id="cz-dec-h">Decoder</h4>
<label class="drop" id="cz-decDrop" tabindex="0"><input type="file" id="cz-decFile" accept=".zip,.bard,.txt"><div class="big">Drop the bits here</div><div class="small">A .zip or .bard file from the encoder, or a .txt file of 0s and 1s.</div></label>
<div class="or">or paste the bits:</div>
<textarea id="cz-bitsIn" spellcheck="false" aria-label="Bits to decode" placeholder="01000010 01010010 01000100 00110001 …"></textarea>
<div class="row"><button type="button" class="primary" id="cz-decodeBtn">Decode</button><button type="button" id="cz-flipBtn">Flip a random bit and decode</button><button type="button" id="cz-decCancel" class="hidden">Cancel</button><span class="verdict" id="cz-verdict"></span></div>
<div class="progress hidden" id="cz-decProg" aria-hidden="true"><span></span></div>
<div class="status" id="cz-decStatus"></div>
<div class="out" id="cz-decOut" aria-live="polite"></div>
<div class="row"><button type="button" id="cz-saveText" class="hidden">Save the decoded file</button><button type="button" id="cz-copyText" class="hidden">Copy the text</button><span class="status" id="cz-saveNote2"></span></div>
</div>
</div>

## Conclusion

"Compression is intelligence" can sound like a slogan, and I don't think it's literally true. 
A compressor doesn't want anything.
The question "how small can you make this file?" is secretly a question about how well you understand it.

---

**Notes**

<ol class="cz-notes">
<li id="cz-fn1">Strictly, the file comes out a couple of bits longer than the sum, because the final number has to be written down with a whole number of bits. Grant's Part 2 is all about this cross-entropy view. <a href="#cz-ref1">↩</a></li>
<li id="cz-fn2">The precise statement bounds the expected total squared error between <i>M</i>'s predictions and the true probabilities by a constant times the Kolmogorov complexity of the true source. <a href="#cz-ref2">↩</a></li>
<li id="cz-fn3"><b>About Bard.</b> For every bit, a dozen small models give an opinion: contexts of the last 1 to 8 bytes, the current word and the one or two before it, the position in the line, a match model that spots long repeats, and a tiny neural network with learned word embeddings. Two logistic mixers learn how much to trust each one, and two calibration stages tidy up the result before the arithmetic coder spends it. The file size includes a header of 14 bytes plus the file name. Bard's own code, about 15 KB, isn't counted here, though the Hutter Prize would count it. On a few hundred kilobytes of English, it comes out at roughly half the size of gzip. It uses floating-point maths, so decode in the same browser you encoded in; the checksum will tell you if anything went wrong.</li>
</ol>

**Further reading**

- Grant Sanderson, [How to compress text to 1 bit per character](https://3blue1brown.substack.com/p/how-to-compress-text-to-1-bit-per), Compression is Intelligence Part 3 ([video](https://www.youtube.com/watch?v=qbsb9DpdZ6s)), with [Part 1](https://www.3blue1brown.com/lessons/entropy/) and [Part 2](https://www.3blue1brown.com/lessons/cross-entropy/).
- Marcus Hutter, [500'000€ Prize for Compressing Human Knowledge](https://www.hutter1.net/prize/index.htm) and its [detailed rules](https://www.hutter1.net/prize/hrules.htm).
- Marcus Hutter, [Artificial Intelligence page](https://www.hutter1.net/ai/ai.htm), and [Algorithmic Randomness as Foundation of Inductive Reasoning and Artificial Intelligence](https://arxiv.org/abs/1102.2468).
- Epoch AI, [Hutter Prize record for compressing Wikipedia text](https://epoch.ai/data/hutter-prize).
- Gwern, [Towards a Better Hutter Prize](https://gwern.net/hutter-prize).
- Wikipedia, [Hutter Prize](https://en.wikipedia.org/wiki/Hutter_Prize).

<script id="cz-bard" src="{% asset_path bard.js %}" data-pjax></script>
<script src="{% asset_path compression.js %}" data-pjax></script>
<script id="cz-lookupjs" src="{% asset_path lookup.js %}" data-pjax></script>
<script src="{% asset_path lookup-demo.js %}" data-pjax></script>
