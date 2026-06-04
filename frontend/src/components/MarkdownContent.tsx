"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

type Props = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className = "" }: Props) {
  return (
    <div
      className={`laed-markdown prose-sm max-w-none text-[inherit] ${className}`.trim()}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
