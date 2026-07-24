import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, RemoveFormatting } from 'lucide-react';

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-gray-100 ${active ? 'bg-gray-200 text-blue-600' : 'text-gray-600'}`}
    >
      {children}
    </button>
  );
}

/**
 * Editor WYSIWYG (TipTap) que produz HTML — usado no campo de conteúdo dos Termos.
 * Resolve o problema de colar texto e perder o espaçamento: o paste preserva
 * parágrafos/estrutura e o output (getHTML) é renderizado tal como o app exibe.
 *
 * @param {string} value - HTML atual
 * @param {(html: string) => void} onChange
 */
export default function RichTextEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sincroniza quando o value externo muda (ex: abrir outra versão para editar).
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL do link:', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito"><Bold size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico"><Italic size={16} /></ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título"><Heading2 size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Subtítulo"><Heading3 size={16} /></ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista"><List size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada"><ListOrdered size={16} /></ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Link"><Link2 size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Limpar formatação"><RemoveFormatting size={16} /></ToolbarButton>
      </div>
      <EditorContent editor={editor} className="rte-content px-3 py-2 min-h-[300px] max-h-[50vh] overflow-y-auto text-sm" />
      <style>{`
        .rte-content .ProseMirror { outline: none; min-height: 280px; }
        .rte-content .ProseMirror p { margin: 0 0 0.75em; line-height: 1.6; }
        .rte-content .ProseMirror h2 { font-size: 1.25rem; font-weight: 700; margin: 1em 0 0.4em; }
        .rte-content .ProseMirror h3 { font-size: 1.1rem; font-weight: 600; margin: 0.8em 0 0.3em; }
        .rte-content .ProseMirror ul { list-style: disc; padding-left: 1.5em; margin: 0 0 0.75em; }
        .rte-content .ProseMirror ol { list-style: decimal; padding-left: 1.5em; margin: 0 0 0.75em; }
        .rte-content .ProseMirror a { color: #2563eb; text-decoration: underline; }
        .rte-content .ProseMirror:empty::before,
        .rte-content .ProseMirror p.is-editor-empty:first-child::before {
          content: 'Escreva ou cole o conteúdo dos termos aqui...';
          color: #9ca3af;
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
