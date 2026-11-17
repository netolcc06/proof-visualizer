import eufCvc5 from '../alethe/__fixtures__/euf.alethe?raw';
import eufCvc5Smt from '../alethe/__fixtures__/euf.smt2?raw';
import liaCvc5 from '../alethe/__fixtures__/lia.alethe?raw';
import liaCvc5Smt from '../alethe/__fixtures__/lia.smt2?raw';
import qCvc5 from '../alethe/__fixtures__/q.alethe?raw';
import qCvc5Smt from '../alethe/__fixtures__/q.smt2?raw';
import skoCvc5 from '../alethe/__fixtures__/sko.alethe?raw';
import skoCvc5Smt from '../alethe/__fixtures__/sko.smt2?raw';
import ex1Cvc5 from '../alethe/__fixtures__/ex1.alethe?raw';
import ex1Cvc5Smt from '../alethe/__fixtures__/ex1.smt2?raw';
import eufVerit from '../alethe/__fixtures__/euf.verit.alethe?raw';
import liaVerit from '../alethe/__fixtures__/lia.verit.alethe?raw';
import qVerit from '../alethe/__fixtures__/q.verit.alethe?raw';

export interface ProofExample {
    id: string;
    label: string;
    // File name shown in the navbar
    name: string;
    alethe: string;
    smt: string;
}

const examples: ProofExample[] = [
    { id: 'euf', label: 'cvc5: EUF with theory lemmas', name: 'euf.alethe', alethe: eufCvc5, smt: eufCvc5Smt },
    { id: 'lia', label: 'cvc5: linear integer arithmetic', name: 'lia.alethe', alethe: liaCvc5, smt: liaCvc5Smt },
    { id: 'q', label: 'cvc5: quantifiers', name: 'q.alethe', alethe: qCvc5, smt: qCvc5Smt },
    { id: 'sko', label: 'cvc5: skolemization', name: 'sko.alethe', alethe: skoCvc5, smt: skoCvc5Smt },
    { id: 'ex1', label: 'cvc5: preprocessing and rewriting', name: 'ex1.alethe', alethe: ex1Cvc5, smt: ex1Cvc5Smt },
    { id: 'euf.verit', label: 'veriT: EUF', name: 'euf.verit.alethe', alethe: eufVerit, smt: eufCvc5Smt },
    {
        id: 'lia.verit',
        label: 'veriT: linear integer arithmetic',
        name: 'lia.verit.alethe',
        alethe: liaVerit,
        smt: liaCvc5Smt,
    },
    { id: 'q.verit', label: 'veriT: quantifiers', name: 'q.verit.alethe', alethe: qVerit, smt: qCvc5Smt },
];

export default examples;
