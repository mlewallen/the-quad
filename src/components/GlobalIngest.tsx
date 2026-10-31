import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileUp } from 'lucide-react';
import { openImporter, useFeedback } from '../feedback';

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

/**
 * Paste anywhere / drop anywhere. Pasting text (spreadsheet cells, CSV, JSON,
 * tracker links, or plain lines) while not typing in a field opens the
 * importer with it; dropping a file on the window does the same.
 */
export default function GlobalIngest() {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || useFeedback.getState().importer) return;
      const file = e.clipboardData?.files?.[0];
      if (file) {
        e.preventDefault();
        file.text().then((text) => openImporter({ text, filename: file.name }));
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;
      e.preventDefault();
      openImporter({ text });
    };
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    };
    const onOver = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = e.dataTransfer!.files[0];
      if (file) file.text().then((text) => openImporter({ text, filename: file.name }));
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <AnimatePresence>
      {dragging && (
        <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="drop-card" initial={{ scale: 0.94, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
            <FileUp size={28} />
            <b>Drop to import projects</b>
            <span className="small">CSV, TSV or JSON, including Jira, Asana, ServiceNow and Linear exports</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
