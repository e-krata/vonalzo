export interface Szamonkeres {
    Uid?: string;
    TantargyUid?: string;
    Datum?: string;
    Modja?: {
        Uid: string;
        Nev: string;
        Leiras?: string;
    };
    OsztalyCsoportUid?: string;
    [key: string]: any;
}
