"""Train the animation's 784 → 16 → 16 → 10 MLP and record real SGD steps.

Requires NumPy. Download the four MNIST IDX gzip files from
https://github.com/cvdfoundation/mnist into --data-dir (see README).
The website plays these traces; it does not train a model on the user's device.
"""
import argparse
import gzip
import json
from pathlib import Path

import numpy as np


parser = argparse.ArgumentParser()
parser.add_argument("--data-dir", type=Path, default=Path("/tmp/inicio-mnist"))
parser.add_argument("--epochs", type=int, default=12)
parser.add_argument("--output", type=Path, default=Path("public/neural/training.json"))
args = parser.parse_args()
rng = np.random.default_rng(42)


def read_idx(name, offset):
    with gzip.open(args.data_dir / name, "rb") as source:
        return np.frombuffer(source.read(), dtype=np.uint8, offset=offset).copy()


x = read_idx("train-images.gz", 16).reshape(-1, 784).astype(np.float32) / 255
y = read_idx("train-labels.gz", 8)
xt = read_idx("test-images.gz", 16).reshape(-1, 784).astype(np.float32) / 255
yt = read_idx("test-labels.gz", 8)
# Matched against the reference's input images. Reserve these for the animation,
# excluding them from held-out metrics before any demonstration SGD update.
demo_indices = [409, 1551, 996, 7435, 1374, 4068, 1800]
evaluation = np.ones(len(xt), dtype=bool)
evaluation[demo_indices] = False
sizes = [784, 16, 16, 10]
weights = [(rng.standard_normal((a, b)) * np.sqrt(2 / a)).astype(np.float32)
           for a, b in zip(sizes[:-1], sizes[1:])]
biases = [np.zeros(b, dtype=np.float32) for b in sizes[1:]]


def forward(images):
    activations = [images]
    for w, b in zip(weights, biases):
        z = activations[-1] @ w + b
        activations.append(np.maximum(z, 0))
    exp = np.exp(z - z.max(axis=1, keepdims=True))
    activations[-1] = exp / exp.sum(axis=1, keepdims=True)
    return activations


def backward(activations, labels):
    delta = activations[-1].copy()
    delta[np.arange(len(labels)), labels] -= 1
    delta /= len(labels)
    dw, db, deltas = [None] * 3, [None] * 3, [None] * 3
    for layer in range(2, -1, -1):
        deltas[layer] = delta.copy()
        dw[layer] = activations[layer].T @ delta
        db[layer] = delta.sum(axis=0)
        delta = delta @ weights[layer].T
        if layer:
            delta *= activations[layer] > 0
    return dw, db, deltas, delta


params = weights + biases
momentum = [np.zeros_like(p) for p in params]
variance = [np.zeros_like(p) for p in params]
step = 0
history = []
for epoch in range(args.epochs):
    order = rng.permutation(len(x))
    for start in range(0, len(x), 128):
        batch = order[start:start + 128]
        dw, db, _, _ = backward(forward(x[batch]), y[batch])
        step += 1
        for p, grad, m, v in zip(params, dw + db, momentum, variance):
            m *= .9
            m += .1 * grad
            v *= .999
            v += .001 * grad * grad
            p -= .001 * (m / (1 - .9 ** step)) / (np.sqrt(v / (1 - .999 ** step)) + 1e-8)
    probabilities = forward(xt[evaluation])[-1]
    targets = yt[evaluation]
    accuracy = float(np.mean(probabilities.argmax(axis=1) == targets))
    loss = float(-np.log(np.maximum(probabilities[np.arange(len(targets)), targets], 1e-10)).mean())
    history.append({"epoch": epoch + 1, "accuracy": accuracy, "loss": loss})
    print(f"epoch {epoch + 1:02}: test accuracy {accuracy:.2%}, loss {loss:.4f}", flush=True)


def rounded(values):
    return np.round(values.astype(np.float64), 6).tolist()


args.output.parent.mkdir(parents=True, exist_ok=True)
model = {"architecture": sizes, "weights": [rounded(w) for w in weights], "biases": [rounded(b) for b in biases]}
args.output.with_name("model.json").write_text(json.dumps(model, separators=(",", ":")) + "\n")
traces = []
for index in demo_indices:
    digit = int(yt[index])
    pixels = xt[index:index + 1]
    activations = forward(pixels)
    dw, db, deltas, saliency = backward(activations, yt[index:index + 1])
    ink = np.flatnonzero(pixels[0] > .015)
    # Include soft edge pixels as well as bright ink, so input activations vary.
    by_intensity = ink[np.argsort(pixels[0, ink], kind="stable")]
    displayed = np.sort(by_intensity[np.linspace(0, len(ink) - 1, 14).astype(int)])
    prediction = int(activations[-1][0].argmax())
    loss_before = float(-np.log(max(activations[-1][0, digit], 1e-10)))
    trace = {
        "label": digit, "sampleIndex": index, "sourceSplit": "test-demo", "prediction": prediction,
        "pixels": (pixels[0] * 255).astype(np.uint8).tolist(),
        "inputIndices": displayed.tolist(),
        "activations": [rounded(a[0]) for a in activations],
        "deltas": [rounded(d[0]) for d in deltas],
        "inputGradient": rounded(saliency[0]),
        "weights": [rounded(weights[0][displayed]), rounded(weights[1]), rounded(weights[2])],
        "gradients": [rounded(dw[0][displayed]), rounded(dw[1]), rounded(dw[2])],
        "lossBefore": loss_before,
    }
    for p, grad in zip(params, dw + db):
        p -= .03 * grad
    trace["lossAfter"] = float(-np.log(max(forward(pixels)[-1][0, digit], 1e-10)))
    traces.append(trace)

artifact = {
    "architecture": sizes, "dataset": "MNIST", "seed": 42,
    "trainingExamples": len(x), "testExamples": int(evaluation.sum()),
    "epochs": args.epochs, "testAccuracy": accuracy,
    "optimizer": "Adam", "traceOptimizer": "SGD", "traceLearningRate": .03,
    "source": "https://github.com/cvdfoundation/mnist",
    "history": history, "traces": traces,
}
args.output.parent.mkdir(parents=True, exist_ok=True)
assert all(np.isfinite(t["lossAfter"]) and t["lossAfter"] < t["lossBefore"] for t in traces)
args.output.write_text(json.dumps(artifact, separators=(",", ":")) + "\n")
print(f"Saved {len(traces)} forward/backward/update traces to {args.output}", flush=True)
