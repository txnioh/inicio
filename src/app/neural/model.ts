import type { TrainingTrace } from './render';

export interface NeuralModel {
  architecture: number[];
  weights: number[][][];
  biases: number[][];
}

/** Forward pass and one illustrative SGD step, without changing the saved model. */
export function evaluateInput(model: NeuralModel, pixels: number[], label: number): TrainingTrace {
  const input = pixels.map(value => Math.max(0, Math.min(255, value)) / 255);
  function forward(weights: number[][][], biases: number[][]) {
    const activations = [input];
    for (let l = 0; l < 3; l++) {
      const z = biases[l].map((bias, j) => bias + weights[l].reduce((sum, row, i) => sum + row[j] * activations[l][i], 0));
      if (l < 2) activations.push(z.map(value => Math.max(0, value)));
      else {
        const max = Math.max(...z);
        const exp = z.map(value => Math.exp(value - max));
        const total = exp.reduce((a, b) => a + b, 0);
        activations.push(exp.map(value => value / total));
      }
    }
    return activations;
  }
  const activations = forward(model.weights, model.biases);
  const prediction = activations[3].indexOf(Math.max(...activations[3]));
  const deltas: number[][] = [[], [], activations[3].map((p, i) => p - Number(i === label))];
  for (let l = 1; l >= 0; l--) {
    deltas[l] = model.weights[l + 1].map((row, i) => activations[l + 1][i] > 0
      ? row.reduce((sum, weight, j) => sum + weight * deltas[l + 1][j], 0) : 0);
  }
  const inputGradient = model.weights[0].map(row => row.reduce((sum, weight, j) => sum + weight * deltas[0][j], 0));
  const gradients = model.weights.map((matrix, l) => matrix.map((row, i) => row.map((_, j) => activations[l][i] * deltas[l][j])));
  const adjusted = model.weights.map((matrix, l) => matrix.map((row, i) => row.map((weight, j) => weight - .03 * gradients[l][i][j])));
  const biases = model.biases.map((row, l) => row.map((bias, j) => bias - .03 * deltas[l][j]));
  const ink = input.map((value, index) => ({ value, index })).filter(p => p.value > .015).sort((a, b) => a.value - b.value);
  const inputIndices = Array.from({ length: 14 }, (_, i) => ink.length
    ? ink[Math.round(i * (ink.length - 1) / 13)].index : Math.round(i * 783 / 13)).sort((a, b) => a - b);
  return {
    label, sampleIndex: -1, prediction, pixels, inputIndices, activations, deltas, inputGradient,
    weights: [inputIndices.map(i => model.weights[0][i]), model.weights[1], model.weights[2]],
    gradients: [inputIndices.map(i => gradients[0][i]), gradients[1], gradients[2]],
    lossBefore: -Math.log(Math.max(1e-10, activations[3][label])),
    lossAfter: -Math.log(Math.max(1e-10, forward(adjusted, biases)[3][label])),
  };
}
