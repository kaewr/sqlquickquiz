import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** แสดง markdown ของโจทย์ (ไม่รับ HTML ดิบ — react-markdown escape ให้เป็นค่าเริ่มต้น) */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ตารางกว้างเลื่อนแนวนอนได้ ไม่ดันหน้าจอมือถือ
          table: (props) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
