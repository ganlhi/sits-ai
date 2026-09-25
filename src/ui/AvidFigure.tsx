/**
 * An AVID card with a zoom button: the card as it sits in the page, and on demand the same
 * card filling the screen in a dialog, for reading at arm's length on a tablet. The dialog
 * shows the very same props, so a card that takes clicks takes them there too.
 *
 * A figure may sit inside a disabled fieldset (a ship's report once the AI has plotted). The
 * zoom control is a link, which a disabled fieldset leaves alone, and the dialog is rendered
 * at the document body, outside any fieldset, so its Close button works.
 */
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AvidCard, type AvidCardProps } from './AvidCard';

export interface AvidFigureProps extends AvidCardProps {
  /** Shown under the enlarged card: a key, or the markers in words. */
  readonly caption?: ReactNode;
}

export function AvidFigure({ caption, ...card }: AvidFigureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  const hide = () => dialog.current?.close();
  return (
    <div className="avid-figure">
      <AvidCard {...card} />
      <a
        className="button zoom"
        href="#zoom"
        role="button"
        title="Show the card larger"
        aria-label="Show the card larger"
        onClick={(e) => {
          e.preventDefault();
          show();
        }}
      >
        ⤢
      </a>
      {createPortal(
        <dialog
          ref={dialog}
          className="avid-dialog"
          aria-label={card.title ?? 'AVID'}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            // a click on the backdrop, outside the dialog's own box, closes it
            if (e.target === dialog.current) hide();
          }}
        >
          {open && (
            <div className="avid-dialog-body">
              <div className="row">
                {card.title && <span className="note grow">{card.title}</span>}
                <button type="button" onClick={hide} aria-label="Close">
                  Close
                </button>
              </div>
              <AvidCard {...card} className={`${card.className ?? ''} big`.trim()} />
              {caption}
            </div>
          )}
        </dialog>,
        document.body,
      )}
    </div>
  );
}
