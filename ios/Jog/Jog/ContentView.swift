import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Jog")
                    .font(.largeTitle)
                #if DEBUG
                NavigationLink("Spike HealthKit") {
                    SpikeView()
                }
                .buttonStyle(.bordered)
                #endif
            }
            .padding()
        }
    }
}
