import ExpoModulesCore
import RoomPlan
import UIKit

/// Exposes Apple's RoomPlan LiDAR room scanner to JavaScript.
/// `isAvailable()` is true only on LiDAR devices (iPhone / iPad Pro). `scanRoom()` opens the scanner
/// full screen and resolves with the room's walls, doors, windows and openings in meters,
/// as 2D segments on the floor plane (x, z), plus the floor area when iOS can measure it.
public class RoomScanModule: Module {
  /// One scanner at a time: a quick double tap must not open a second one whose promise would never settle.
  private var scanning = false

  public func definition() -> ModuleDefinition {
    Name("RoomScan")

    Function("isAvailable") { () -> Bool in
      return RoomCaptureSession.isSupported
    }

    AsyncFunction("scanRoom") { (promise: Promise) in
      guard RoomCaptureSession.isSupported else {
        promise.reject("UNSUPPORTED", "Room scanning needs an iPhone or iPad with LiDAR (Pro models).")
        return
      }
      guard !self.scanning else {
        promise.reject("BUSY", "The scanner is already open.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("NO_VIEW", "Could not open the scanner.")
        return
      }
      self.scanning = true
      let scanner = RoomScanViewController()
      scanner.onFinish = { [weak self] result in
        self?.scanning = false
        promise.resolve(result)
      }
      scanner.onCancel = { [weak self] in
        self?.scanning = false
        promise.reject("CANCELED", "Scan canceled.")
      }
      scanner.onError = { [weak self] message in
        self?.scanning = false
        promise.reject("SCAN_FAILED", message)
      }
      scanner.modalPresentationStyle = .fullScreen
      presenter.present(scanner, animated: true)
    }
    .runOnQueue(.main)
  }
}

final class RoomScanViewController: UIViewController, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
  var onFinish: (([String: Any]) -> Void)?
  var onCancel: (() -> Void)?
  var onError: ((String) -> Void)?

  private var captureView: RoomCaptureView!
  private var result: CapturedRoom?
  private var settled = false
  private let doneButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    captureView = RoomCaptureView(frame: view.bounds)
    captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    captureView.captureSession.delegate = self
    captureView.delegate = self
    view.addSubview(captureView)

    style(doneButton, title: "Done", filled: true)
    doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    style(cancelButton, title: "Cancel", filled: false)
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    view.addSubview(doneButton)
    view.addSubview(cancelButton)
    NSLayoutConstraint.activate([
      cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      doneButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      doneButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
  }

  private func style(_ button: UIButton, title: String, filled: Bool) {
    button.translatesAutoresizingMaskIntoConstraints = false
    button.setTitle(title, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    button.setTitleColor(filled ? .white : .label, for: .normal)
    button.backgroundColor = filled ? UIColor(red: 0.76, green: 0.25, blue: 0.05, alpha: 1) : UIColor.systemBackground.withAlphaComponent(0.85)
    button.layer.cornerRadius = 10
    button.contentEdgeInsets = UIEdgeInsets(top: 10, left: 18, bottom: 10, right: 18)
  }

  @objc private func doneTapped() {
    if let room = result {
      finish(with: room)
    } else {
      // Stop scanning: RoomPlan processes the room and shows the result, then "Use this scan".
      captureView.captureSession.stop()
      doneButton.setTitle("Processing…", for: .normal)
      doneButton.isEnabled = false
    }
  }

  @objc private func cancelTapped() {
    captureView.captureSession.stop()
    settle { self.onCancel?() }
  }

  // MARK: RoomCaptureViewDelegate

  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
    return true
  }

  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    result = processedResult
    doneButton.setTitle("Use this scan", for: .normal)
    doneButton.isEnabled = true
  }

  // MARK: RoomCaptureSessionDelegate

  /// The session ended. With an error (camera denied, not enough of the room seen) RoomPlan shows no result,
  /// so close the scanner and report it instead of leaving "Processing…" on screen.
  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
    guard let error = error, result == nil else { return }
    let message = "The scan could not finish (\(error.localizedDescription)). Try again with more light, or measure the room by hand."
    settle { self.onError?(message) }
  }

  // MARK: Result

  private func settle(_ action: @escaping () -> Void) {
    guard !settled else { return }
    settled = true
    dismiss(animated: true, completion: action)
  }

  private func finish(with room: CapturedRoom) {
    var data: [String: Any] = [
      "walls": room.walls.map { segment($0) },
      "doors": room.doors.map { segment($0) },
      "windows": room.windows.map { segment($0) },
      "openings": room.openings.map { segment($0) },
    ]
    if #available(iOS 17.0, *) {
      let area = room.floors.reduce(0.0) { $0 + polygonArea($1.polygonCorners) }
      if area > 0 { data["floorAreaM2"] = area }
    }
    settle { self.onFinish?(data) }
  }

  /// A surface as a line on the floor plan: its center, turned along its own x axis, half its width each way.
  private func segment(_ s: CapturedRoom.Surface) -> [String: Any] {
    let t = s.transform
    let center = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let axis = SIMD3<Float>(t.columns.0.x, t.columns.0.y, t.columns.0.z)
    let half = s.dimensions.x / 2
    let a = center - axis * half
    let b = center + axis * half
    return [
      "x1": Double(a.x), "y1": Double(a.z), "x2": Double(b.x), "y2": Double(b.z),
      "width": Double(s.dimensions.x), "height": Double(s.dimensions.y),
      "confidence": confidence(s.confidence),
    ]
  }

  private func confidence(_ c: CapturedRoom.Confidence) -> String {
    switch c {
    case .high: return "high"
    case .medium: return "medium"
    case .low: return "low"
    @unknown default: return "low"
    }
  }

  /// Shoelace area of a flat floor outline. The corners lie in one plane of the surface's own frame; measuring
  /// it in both candidate planes and keeping the larger means a flat result never silently becomes 0.
  private func polygonArea(_ corners: [SIMD3<Float>]) -> Double {
    guard corners.count >= 3 else { return 0 }
    var xy = 0.0
    var xz = 0.0
    for i in 0..<corners.count {
      let p = corners[i]
      let q = corners[(i + 1) % corners.count]
      xy += Double(p.x) * Double(q.y) - Double(q.x) * Double(p.y)
      xz += Double(p.x) * Double(q.z) - Double(q.x) * Double(p.z)
    }
    return max(abs(xy), abs(xz)) / 2
  }
}
