import type { AppThunk } from '../../store';
import { set } from '../file/fileSlice';
import { allowRenderNewFile, blockRender, reRender } from '../externalCmd/externalCmd';
import { process, setSmt } from './proofSlice';
import { DOT_ERROR, formatLoadError, looksLikeDot, parseSession, prepareProof, sessionFits } from './alethe';
import type { SessionFile } from './alethe';

export type LoadResult = { ok: true } | { ok: false; error: string };

export interface LoadProofArgs {
    name: string;
    text: string;
    smt?: string;
}

// Loads an Alethe proof (or a session JSON) into the store. Never throws: errors come back in the result.
export const loadProof =
    ({ name, text, smt }: LoadProofArgs): AppThunk<LoadResult> =>
    (dispatch) => {
        try {
            const isSession = text.trimStart().startsWith('{');
            let session: SessionFile | undefined;
            if (isSession) session = parseSession(text);
            else if (looksLikeDot(text)) throw new Error(DOT_ERROR);

            const source = session ? session.alethe : text;
            const { nodes, letMap } = prepareProof(source);
            if (session && !sessionFits(session, nodes.length)) {
                throw new Error('Invalid session file: the saved view does not match the proof.');
            }

            dispatch(set({ name: session ? session.name || name : name, value: source }));
            dispatch(allowRenderNewFile());
            // Saved sessions keep their node positions
            dispatch(session ? blockRender() : reRender());
            // An explicit problem wins over the one saved in the session; never keep a stale one
            dispatch(setSmt(smt ?? session?.smt ?? ''));
            dispatch(process({ nodes, letMap, source, session }));
            return { ok: true };
        } catch (e) {
            return { ok: false, error: formatLoadError(e) };
        }
    };
