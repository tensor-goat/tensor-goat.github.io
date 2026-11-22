---
title: From one half-plane to a grown neuron
date: 2026-11-07 16:00:00
tags:
  - neurons
  - linear-algebra
  - mostly AI Generated content
---

This post builds a neural network up one picture at a time, in the style of Margalit and Rabinoff's [*Interactive Linear Algebra*](https://textbooks.math.gatech.edu/ila/). It starts with a single perceptron, which can only cut the plane in half. Then it stacks perceptrons into an MLP, adds a second hidden layer, and finally steps sideways to G1, a neuron that grows its own bends. Every picture is interactive.

<link rel="stylesheet" href="demos.css">

## 1. The perceptron as a half-space

**Definition.** A perceptron with weight vector $w$ in $\mathbf{R}^n$ and bias $b$ in $\mathbf{R}$ is the function

$$f(x)=\begin{cases}+1 & \text{if } w\cdot x+b>0\\ -1 & \text{if } w\cdot x+b<0\end{cases}$$

The function $f$ is not linear, but it is built from a linear part. Since $w\cdot x=w^Tx$, the map $x\mapsto w^Tx$ is a matrix transformation with the $1\times n$ matrix $w^T$. So a perceptron collapses $\mathbf{R}^n$ onto a line, shifts that line by $b$, and reads off the sign.

### The picture: a translated null space

The decision boundary is the solution set of the single equation $w^Tx=-b$. If $w\neq 0$:

- The null space $\operatorname{Nul}(w^T)=\{x : w\cdot x=0\}$ is $\operatorname{Span}\{w\}^\perp$, and it has dimension $n-1$.
- The boundary is $p+\operatorname{Nul}(w^T)$, where $p$ is any particular solution.

So the boundary is a hyperplane, $w$ is normal to it, and the perceptron answers $+1$ on one side and $-1$ on the other. That side is a **half-space**.

<div id="hs-demo" class="hs-demo"><noscript>This interactive demo needs JavaScript.</noscript></div>
<script src="perceptron.js"></script>

Changing $w_1$ or $w_2$ rotates the line, and changing $b$ slides it parallel to itself. The dashed line runs from the yellow point to its projection onto $\operatorname{Span}\{w\}$, because the score only depends on that projection. The signed distance to the boundary is $(w\cdot x+b)/\|w\|$.

### Learning, and where it fails

Write $\tilde x=(x,1)$ and $\tilde w=(w,b)$, so the score is $\tilde w\cdot\tilde x$. A point with label $y=\pm1$ is right when $y\,\tilde w\cdot\tilde x>0$. The **perceptron update** picks a wrong point and adds $y\tilde x$ to $\tilde w$. That raises the score on that point by $\|\tilde x\|^2$, and if some $\tilde w$ separates the data, the updates stop after finitely many steps.

But no $\tilde w$ exists for XOR. Label $(1,0)$ and $(0,1)$ as $+1$, and $(0,0)$ and $(1,1)$ as $-1$. A separating perceptron would need

$$w_1+b>0,\qquad w_2+b>0,\qquad b<0,\qquad w_1+w_2+b<0.$$

The first two add up to $w_1+w_2+2b>0$, and the last two add up to $w_1+w_2+2b<0$. One straight cut can't do it.

## 2. The MLP as a composition of half-spaces

A perceptron gives one half-space. An MLP uses many half-spaces to build new coordinates, then applies one more perceptron in those coordinates.

**Definition.** A multilayer perceptron with one hidden layer of $k$ units is the function

$$h=\sigma(Wx+b),\qquad y=u\cdot h+c,\qquad f(x)=\operatorname{sign}(y).$$

Here, $W$ is a $k\times n$ matrix, $b$ and $u$ are in $\mathbf{R}^k$, and $c$ is a scalar. The activation $\sigma$ is applied to each entry separately.

Each row $w_i$ of $W$, together with $b_i$, is a perceptron from section 1. Its boundary is the hyperplane $w_i\cdot x+b_i=0$, and $w_i$ is normal to it.

<div id="ml-demo" class="nd"><noscript>This interactive demo needs JavaScript.</noscript></div>
<script src="mlp.js"></script>

The left plot is the input plane, with the two hidden units' lines dashed. The right plot is the same plane after the hidden layer: the grey grid is the input grid carried through $\sigma(Wx+b)$, and the readout is the single straight line there. Dragging the yellow point shows where one input lands.

### Why the activation can't be linear

**Fact.** If $\sigma(t)=t$, then

$$y=u\cdot(Wx+b)+c=(W^Tu)\cdot x+(u\cdot b+c).$$

This is a single perceptron with weight vector $W^Tu$. A composition of affine maps is affine, so extra linear layers add no new shapes.

In the demo, set $\sigma$ to linear and train on XOR. The answer stays one half-plane. In my test, all 20 random starts left 28 of 56 points wrong.

### The picture: an arrangement of lines

With $\sigma=\operatorname{sign}$, the hidden layer records which side of each line $x$ is on:

$$h\in\{-1,+1\}^k.$$

So $k$ lines cut the plane into regions, and every point in a region maps to one corner of a cube. The readout is then a perceptron on those corners. In the plane, $k$ lines make at most $1+k+\binom{k}{2}$ regions, which is 4 regions for 2 lines. Using tanh rounds these corners off, which is why the grid in the right plot is squeezed into a square with soft edges.

**Example (XOR).** Let

$$W=\begin{pmatrix}1&1\\1&1\end{pmatrix},\quad b=\begin{pmatrix}1\\-1\end{pmatrix},\quad u=\begin{pmatrix}1\\-1\end{pmatrix},\quad c=-1,\quad \sigma=\operatorname{sign}.$$

The two lines are parallel, and they cut out a band. Here $W$ has rank 1, yet the nonlinearity still produces three different hidden corners:

| Input $x$ | $Wx+b$ | $h$ | $y=u\cdot h+c$ | Output |
|---|---|---|---:|---:|
| $(1.5,-1.5)$ | $(1,-1)$ | $(+1,-1)$ | $1$ | $+1$ |
| $(-1.5,1.5)$ | $(1,-1)$ | $(+1,-1)$ | $1$ | $+1$ |
| $(1.5,1.5)$ | $(4,2)$ | $(+1,+1)$ | $-1$ | $-1$ |
| $(-1.5,-1.5)$ | $(-2,-4)$ | $(-1,-1)$ | $-1$ | $-1$ |

XOR wasn't linearly separable in $x$, but it is linearly separable in $h$. This is the same system of inequalities from section 1, now solved in new coordinates.

### Learning

**Recipe: one gradient step.** Use the logistic loss, with labels $t\in\{0,1\}$.

1. Compute $z=Wx+b$, $h=\sigma(z)$, and $y=u\cdot h+c$.
2. Compute the error $e=\dfrac{1}{1+e^{-y}}-t$.
3. Update the readout, using the step size $\eta$:
$$u\leftarrow u-\eta e\,h,\qquad c\leftarrow c-\eta e.$$
4. Update each hidden unit using the chain rule:
$$w_i\leftarrow w_i-\eta e\,u_i\,\sigma'(z_i)\,x,\qquad b_i\leftarrow b_i-\eta e\,u_i\,\sigma'(z_i).$$

Each $w_i$ moves along $x$, as in the perceptron update, but with a different scale. So for one sample, the change in $W$ is a rank-1 matrix: a vector times $x^T$.

The factor $\sigma'(z_i)$ is largest near that unit's line, because $z_i=0$ there. It's zero almost everywhere for $\operatorname{sign}$, which is why the demo can't train with that setting.

### What 2 hidden units can and can't do

| Data, tanh, 2 hidden units | Random starts with every point right | Typical result |
|---|---:|---|
| Half-plane | 20 of 20 | 0 wrong |
| Strip | 19 of 20 | 0 wrong |
| XOR | 10 of 20 | Half the starts stall |
| Disk | 0 of 20 | At least 7 of 67 wrong |

- **The disk:** with sign units, two lines can't enclose a bounded region, and a closed shape needs at least 3 in the plane. Two tanh units also failed in every start here.
- **XOR:** the 2 units are enough, but half the starts stalled. So having a solution in the model doesn't mean training will find it.

**Theorem (universal approximation).** Let $\sigma$ be continuous and not a polynomial. On any closed, bounded set, a one-hidden-layer network can approximate any continuous function as closely as you like, given enough hidden units.

The theorem says a good network exists. It doesn't say how many units you need, or that gradient descent will find it.

## 3. Adding a second hidden layer

The second layer works on the first layer's output instead of on $x$, so it can bend the first layer's edges. But it can't always add new ones. In this small test, widening the first layer helped more than going deeper.

**Definition.** An MLP with two hidden layers is the function

$$h_1=\sigma(W_1x+b_1),\qquad h_2=\sigma(W_2h_1+b_2),\qquad y=u\cdot h_2+c.$$

If $\sigma$ is linear, the layers collapse into one half-space again, this time with weight vector $W_1^TW_2^Tu$.

<div id="dl-demo" class="nd"><noscript>This interactive demo needs JavaScript.</noscript></div>
<script src="deep.js"></script>

### The picture: straight lines that bend

Each row of $W_2$ gives a straight line in the $h_1$ plane. Pulled back to the input plane, that line becomes the curve

$$w\cdot\sigma(W_1x+b_1)+b=0.$$

This is why the orange lines are straight in the middle plot but bent in the left one. The readout does the same thing one layer later: it's straight in $h_2$, but the white boundary curves in $x$.

### What the extra layer can and can't add

**Fact.** With $\sigma=\operatorname{sign}$, a second layer adds no new boundaries.

$h_1$ takes only one value per region of the first layer's arrangement. Later layers can only group those regions, so every boundary still lies on a first-layer line. With 2 units in layer 1, you still can't enclose a bounded region, however deep the network gets.

With tanh, $h_1$ varies smoothly, so layer 2 can bend the edges into curved shapes that sign units can't make. This gives more shapes to work with, but it doesn't guarantee a good fit.

I ran 30 random starts on each task, training for 2,500 steps. The table shows how many starts got every training point right:

| Data | One layer, 2 units (9 parameters) | **Two layers, 2 + 2 units (15 parameters)** | One layer, 4 units (17 parameters) |
|---|---:|---:|---:|
| XOR | 15 | **20** | 30 |
| Strip | 28 | **29** | 30 |
| Two strips | 0 | **0** | 18 |
| Disk | 0 | **2** | 30 |
| Ring | 0 | **0** | 0 |

So the extra layer helped a little, but at about the same size, the wider network did better on every task it could fit.

### The disk is a warning

The demo opens on one of the two disk runs that got all 104 training points right. It looks like a success until you see the region: it's a curved wedge that leaks toward the plot's edges, not a disk. Fresh points show the difference:

| Network with every training point right | Fresh points inside the training box | Points beyond the box (all truly outside) |
|---|---:|---:|
| Two layers, 2 + 2 units | 91.0% | 97.6% |
| One layer, 4 units | 93.5–95.3% (first 6 of 30 runs) | 100% |
| Always answering "outside" | 78.8% | 100% |

A perfect training score doesn't mean it learned the shape.

**Recipe: backpropagation.** Let $D_1$ and $D_2$ be diagonal matrices holding $\sigma'$ for each layer, and let $e$ be the error from section 2.

1. Run the forward pass to get $z_1,h_1,z_2,h_2,y$.
2. Start at the output with $g_2=e\,D_2u$.
3. Move back one layer with $g_1=D_1W_2^Tg_2$.
4. Update each layer using its own vector:
$$W_2\leftarrow W_2-\eta\,g_2h_1^T,\qquad W_1\leftarrow W_1-\eta\,g_1x^T.$$

Each update is still a vector times that layer's input, so it's rank 1 for a single sample. The vector for $W_1$ passes through both $D$ matrices, so if units saturate, that signal can shrink toward zero. That's one reason deep networks can be hard to train.

These are small toy datasets with only 2 units per layer. Depth can pay off much more at larger widths and on data with repeated structure, which this test doesn't show.

## 4. Growing a neuron instead: G1

Sections 2 and 3 fix the shape of every unit, since each one is a tanh, and learn where to put the lines. G1 turns this around. It's a single neuron that starts as a perceptron and grows **bends** one at a time:

$$y=w\cdot x+\sum_k r_k\,f_k(v_k\cdot z)+c.$$

Read it with the MLP in mind:

- **$v_k\cdot z$ is a row of $W$:** a direction to measure along.
- **$f_k$ plays the part of $\sigma$, but it's learned:** each one is a piecewise-linear curve, made of one slope and 20 hinges.
- **$r_k$ is the readout weight,** like $u_k$.
- **$z$ grows:** it starts as $x$, and every bend appends its output, so $z=(x_1,x_2,f_1,f_2,\dots)$. A bend that measures along the plane is like a hidden unit. A bend that reads earlier bends' outputs, or the neuron's own answer, is like a deeper layer.

Training is also different. There are no random starts and no gradient steps over everything at once. Each round tries about 30 candidate directions, refits every free curve and the line together for each one, and keeps the candidate with the lowest loss on held-out points. When a new bend reads an earlier bend's output, that earlier curve freezes, so only its weight can change. The same data gives the same neuron every time.

<div id="g1-demo" class="nd g1"><noscript>This interactive demo needs JavaScript.</noscript></div>
<script src="g1-data.js"></script>
<script src="g1.js"></script>

The trace opens on the disk, the shape that defeated two tanh units. Press **Back** twice, then **Grow**, to watch it from the start.

### Why two bends can close a disk

Both disk bends end up as bumps: each curve is low at both ends and high in the middle, and they measure along roughly perpendicular directions, at about 175° and 85°. A bump along one direction is a soft strip, so the sum of two crossing strips is a raised patch where they overlap, and the single cut at zero closes it off.

A tanh unit can't make a bump, because it only steps up once along its direction. The MLP needed two units to make one strip, as in the XOR band, so building the same two crossing strips from tanh units would take four. Four tanh units is also what fit the disk in every start in section 3. Here, one learned curve does the work of two fixed ones.

### Every task in the trace

| Task | Bends | Score (overlap with the true shape) | Stored numbers |
|---|---:|---:|---:|
| XOR | 1 | 4 of 4 corners | 28 |
| Slab | 1 | 0.992 | 28 |
| Two parallel strips | 1 | 0.966 | 28 |
| Outside slab | 2 | 0.990 | 54 |
| Disk | 2 | 0.964 | 54 |
| Cross | 4 | 0.971 | 111 |
| Ring | 4 | 0.929 | 109 |
| Square | 6 | 0.938 | 171 |
| Hollow cross | 11 | 0.939 | 342 |
| Picture frame | 11 | 0.931 | 339 |
| Cross outline | 12 | 0.919 | 375 |

The score is the overlap (intersection over union) between the region G1 answers $+1$ on and the true shape. Every task stopped because it reached its held-out target, except the cross outline, which hit the 12-bend limit.

A few things to try:

- **The dial:** each spoke is one of the 24 plane directions, and its length is how much it would have cut the held-out loss. On the cross, the first two bends land close to the true arms at 15° and 115°.
- **The cards:** each bend's curve is drawn next to its footprint on the plane. The dashed curve is the previous stage's version, so you can see earlier bends reshape when a new one arrives.
- **The long runs:** on the hollow cross and the cross outline, later bends start reading their own answer and earlier bends. The fit keeps improving, but it stops being a short list of strips.

### What this comparison does and doesn't show

This isn't a fair contest with the MLP demos. G1's tasks use different data, scaled to a smaller box, and its scores measure overlap with the true shape instead of training points. Each bend also costs 25 to 30 stored numbers, its direction plus its curve, so G1's disk uses 54 numbers against the MLP's 9 to 17.

What it does show is the trade. An MLP keeps each unit cheap and fixed, and needs more of them, and the right random start. G1 spends more numbers per unit, but each unit can take whatever shape the data asks for, and its growth can be replayed and read bend by bend. These are real fits replayed from saved runs. The demo doesn't run G1 itself.

## Vocabulary

- **Half-space:** one of the two sides of a hyperplane, which is everything a single perceptron can say.
- **Hidden layer:** the map $x\mapsto\sigma(Wx+b)$, which produces new coordinates.
- **Activation function:** the nonlinear $\sigma$. Without it, the layers collapse into one.
- **Hyperplane arrangement:** the regions made by the lines $w_i\cdot x+b_i=0$.
- **Readout:** the last perceptron $u\cdot h+c$, whose half-space is the only straight cut in $h$.
- **Bend:** one of G1's grown terms $r_k f_k(v_k\cdot z)$, a learned curve measured along one direction.
- **Frozen bend:** a bend whose curve is fixed because a later bend reads its output. Only its weight can still change.
