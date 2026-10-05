// Builds the background mask for the holographic foil on the profile photo
// (`holo_mask` in _pages/about.md), using Apple Vision's subject segmentation (macOS 14+).
// The mask is opaque over the background and transparent over the person, with a soft edge.
// Re-run it whenever the profile photo changes:
//
//   swift bin/holo-mask.swift assets/img/prof_pic.jpg assets/img/prof_pic_holo_mask.png [preview.jpg]
//
// The optional preview tints the background magenta, to check the cut-out by eye.
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
  print("usage: swift bin/holo-mask.swift <photo> <mask.png> [preview.jpg]")
  exit(1)
}
let input = URL(fileURLWithPath: args[1])
let maskURL = URL(fileURLWithPath: args[2])

let handler = VNImageRequestHandler(url: input)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let observation = request.results?.first else {
  print("No subject found in \(args[1])")
  exit(1)
}
let buffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
let raw = CIImage(cvPixelBuffer: buffer)
let foreground = raw.clampedToExtent().applyingGaussianBlur(sigma: 1.5).cropped(to: raw.extent)

let invert = CIFilter.colorInvert()
invert.inputImage = foreground
let background = invert.outputImage!

let toAlpha = CIFilter.maskToAlpha()
toAlpha.inputImage = background
let context = CIContext()
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
try context.writePNGRepresentation(of: toAlpha.outputImage!, to: maskURL, format: .RGBA8, colorSpace: sRGB)
print("Wrote \(args[2]) (\(Int(raw.extent.width))x\(Int(raw.extent.height)))")

if args.count >= 4 {
  let photo = CIImage(contentsOf: input)!
  let tint = CIImage(color: CIColor(red: 1, green: 0, blue: 1, alpha: 0.55)).cropped(to: photo.extent).composited(over: photo)
  let blend = CIFilter.blendWithMask()
  blend.inputImage = tint
  blend.backgroundImage = photo
  blend.maskImage = background
  try context.writeJPEGRepresentation(of: blend.outputImage!, to: URL(fileURLWithPath: args[3]), colorSpace: sRGB)
  print("Wrote preview \(args[3])")
}
