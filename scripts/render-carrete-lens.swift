// Offline Metal translation of OrbitLens.tsx's fragment shader.
// Input packets: Float32 time followed by width * height * 4 RGBA bytes.
// Output packets: the same number of RGBA bytes, with the original lens applied.
import Foundation
import Metal

let width = Int(CommandLine.arguments[1])!
let height = Int(CommandLine.arguments[2])!
let distortion = Float(CommandLine.arguments[3])!
let ripple = Float(CommandLine.arguments[4])!
let dispersion = Float(CommandLine.arguments[5])!
let sideStart = Float(CommandLine.arguments[6])!
let device = MTLCreateSystemDefaultDevice()!
let source = """
#include <metal_stdlib>
using namespace metal;
float2 lens(float2 uv, float2 size, float time, float distortion, float rippleAmount, float channel, float side) {
  float2 delta = (uv - .5) * size;
  float unit = min(size.x, size.y);
  float radius = length(delta);
  float n = radius / (unit * .70);
  float pincushion = distortion * channel * pow(clamp(n, 0.f, 1.6f), 2.2f) * side;
  float ripple = rippleAmount * sin(6.28318f * radius / (unit * .42f) - time * 1.1f) * side;
  return .5 + delta / (1. + pincushion + ripple) / size;
}
float4 sampleScene(texture2d<float, access::sample> scene, float2 p) {
  constexpr sampler s(coord::normalized, address::clamp_to_edge, filter::linear);
  if (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) return float4(.99216, .99216, .98824, 1.);
  return scene.sample(s, p);
}
kernel void renderLens(texture2d<float, access::sample> scene [[texture(0)]],
  texture2d<float, access::write> output [[texture(1)]], constant float *u [[buffer(0)]],
  uint2 pixel [[thread_position_in_grid]]) {
  if (pixel.x >= uint(u[0]) || pixel.y >= uint(u[1])) return;
  float2 size = float2(u[0], u[1]);
  float2 uv = (float2(pixel) + .5) / size;
  float radiusX = min(size.x * .48f, size.y * .46f);
  float side = smoothstep(u[6], 1.05f, abs((uv.x - .5f) * size.x) / radiusX);
  float dispersion = u[5] * side;
  float r = sampleScene(scene, lens(uv, size, u[2], u[3], u[4], 1. + dispersion, side)).r;
  float g = sampleScene(scene, lens(uv, size, u[2], u[3], u[4], 1., side)).g;
  float b = sampleScene(scene, lens(uv, size, u[2], u[3], u[4], 1. - dispersion, side)).b;
  output.write(float4(r, g, b, 1.), pixel);
}
"""
let library = try device.makeLibrary(source: source, options: nil)
let pipeline = try device.makeComputePipelineState(function: library.makeFunction(name: "renderLens")!)
let queue = device.makeCommandQueue()!
let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm,
  width: width, height: height, mipmapped: false)
descriptor.storageMode = .shared
descriptor.usage = [.shaderRead, .shaderWrite]
let input = device.makeTexture(descriptor: descriptor)!
let output = device.makeTexture(descriptor: descriptor)!
let region = MTLRegionMake2D(0, 0, width, height)
let length = width * height * 4
func readExactly(_ count: Int) throws -> Data? {
  var data = Data()
  while data.count < count {
    guard let part = try FileHandle.standardInput.read(upToCount: count - data.count), !part.isEmpty else {
      if data.isEmpty { return nil }
      throw NSError(domain: "Truncated lens frame", code: 1)
    }
    data.append(part)
  }
  return data
}
while let header = try readExactly(4) {
  try autoreleasepool {
    let time = header.withUnsafeBytes { $0.loadUnaligned(as: Float.self) }
    guard let pixels = try readExactly(length) else { throw NSError(domain: "Missing lens frame", code: 2) }
    pixels.withUnsafeBytes { input.replace(region: region, mipmapLevel: 0,
      withBytes: $0.baseAddress!, bytesPerRow: width * 4) }
    let command = queue.makeCommandBuffer()!
    let encoder = command.makeComputeCommandEncoder()!
    encoder.setComputePipelineState(pipeline)
    encoder.setTexture(input, index: 0)
    encoder.setTexture(output, index: 1)
    let uniforms: [Float] = [Float(width), Float(height), time, distortion, ripple, dispersion, sideStart, 0]
    uniforms.withUnsafeBytes { encoder.setBytes($0.baseAddress!, length: $0.count, index: 0) }
    encoder.dispatchThreads(MTLSize(width: width, height: height, depth: 1),
      threadsPerThreadgroup: MTLSize(width: 16, height: 16, depth: 1))
    encoder.endEncoding()
    command.commit()
    command.waitUntilCompleted()
    if let error = command.error { throw error }
    var rendered = Data(count: length)
    rendered.withUnsafeMutableBytes { output.getBytes($0.baseAddress!, bytesPerRow: width * 4,
      from: region, mipmapLevel: 0) }
    try FileHandle.standardOutput.write(contentsOf: rendered)
  }
}
