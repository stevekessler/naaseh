import SwiftUI

public struct TaskMemoDocumentView: View {
    let document: TaskMemoDocument
    public init(document: TaskMemoDocument) { self.document = document }
    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(document.blocks.enumerated()), id: \.offset) { _, block in
                if block.type == "paragraph" { richText(block.runs ?? []) }
                else {
                    ForEach(Array((block.items ?? []).enumerated()), id: \.offset) { index, item in
                        HStack(alignment: .firstTextBaseline) {
                            Text(block.type == "orderedList" ? "\(index + 1)." : "•")
                            richText(item.runs)
                        }
                    }
                }
            }
        }.textSelection(.enabled)
    }
    private func richText(_ runs: [TaskMemoDocument.Run]) -> Text {
        Text(runs.reduce(into: AttributedString()) { result, run in
            var value = AttributedString(run.text)
            var font = Font.body
            if run.marks.contains("bold") { font = font.bold() }
            if run.marks.contains("italic") { font = font.italic() }
            if run.marks.contains("code") { font = font.monospaced() }
            value.font = font
            if run.marks.contains("strikethrough") { value.strikethroughStyle = .single }
            result.append(value)
        })
    }
}

/// Edits the constrained document directly, retaining every run and list boundary.
public struct TaskMemoEditorView: View {
    @Binding private var document: TaskMemoDocument
    public init(document: Binding<TaskMemoDocument>) { _document = document }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(document.blocks.indices, id: \.self) { index in
                VStack(alignment: .leading) {
                    HStack {
                        Text(document.blocks[index].type == "paragraph" ? "Paragraph" : "List").font(.headline)
                        Spacer()
                        Button("Remove block", systemImage: "trash") { document.blocks.remove(at: index) }
                            .labelStyle(.iconOnly)
                    }
                    if document.blocks[index].type == "paragraph" {
                        runsEditor(Binding(
                            get: { document.blocks.indices.contains(index) ? document.blocks[index].runs ?? [] : [] },
                            set: { if document.blocks.indices.contains(index) { document.blocks[index].runs = $0 } }
                        ))
                    } else {
                        ForEach((document.blocks[index].items ?? []).indices, id: \.self) { itemIndex in
                            HStack(alignment: .top) {
                                Text(document.blocks[index].type == "orderedList" ? "\(itemIndex + 1)." : "•")
                                runsEditor(Binding(
                                    get: {
                                        guard document.blocks.indices.contains(index),
                                              let items = document.blocks[index].items, items.indices.contains(itemIndex) else { return [] }
                                        return items[itemIndex].runs
                                    },
                                    set: { value in
                                        guard document.blocks.indices.contains(index),
                                              document.blocks[index].items?.indices.contains(itemIndex) == true else { return }
                                        document.blocks[index].items?[itemIndex].runs = value
                                    }
                                ))
                            }
                        }
                        Button("Add list item") {
                            document.blocks[index].items?.append(.init(runs: [.init(text: "")]))
                        }
                    }
                }.padding(8)
            }
            Menu("Add memo block", systemImage: "plus") {
                Button("Paragraph") { document.blocks.append(.init(type: "paragraph", runs: [.init(text: "")], items: nil)) }
                Button("Bulleted list") { addList("unorderedList") }
                Button("Numbered list") { addList("orderedList") }
            }
        }
    }
    private func addList(_ type: String) {
        document.blocks.append(.init(type: type, runs: nil, items: [.init(runs: [.init(text: "")])]))
    }
    private func runsEditor(_ runs: Binding<[TaskMemoDocument.Run]>) -> some View {
        VStack(alignment: .leading) {
            ForEach(runs.wrappedValue.indices, id: \.self) { index in
                HStack(alignment: .top) {
                    TextField("Memo text", text: Binding(
                        get: { runs.wrappedValue.indices.contains(index) ? runs.wrappedValue[index].text : "" },
                        set: { if runs.wrappedValue.indices.contains(index) { runs.wrappedValue[index].text = $0 } }
                    ), axis: .vertical)
                    Menu("Formatting", systemImage: "textformat") {
                        ForEach(["bold", "italic", "strikethrough", "code"], id: \.self) { mark in
                            Toggle(mark.capitalized, isOn: Binding(
                                get: { runs.wrappedValue.indices.contains(index) && runs.wrappedValue[index].marks.contains(mark) },
                                set: { enabled in
                                    guard runs.wrappedValue.indices.contains(index) else { return }
                                    runs.wrappedValue[index].marks.removeAll { $0 == mark }
                                    if enabled { runs.wrappedValue[index].marks.append(mark) }
                                }
                            ))
                        }
                        Button("Remove text") { runs.wrappedValue.remove(at: index) }
                    }
                }
            }
            Button("Add text") { runs.wrappedValue.append(.init(text: "")) }
        }
    }
}
