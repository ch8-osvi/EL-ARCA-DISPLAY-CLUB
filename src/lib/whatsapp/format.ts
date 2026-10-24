/** WhatsApp bold uses one asterisk; preserve literal markers inside code. */
export function formatWhatsAppText(text: string) {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /\*{2,}([^\n]+?)\*{2,}/g,
            (_, value: string) => `*${value.replace(/^\*+|\*+$/g, "")}*`,
          ),
    )
    .join("");
}
