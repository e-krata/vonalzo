import { KretaEnum } from "./kreta-enum";

export interface Mulasztas {
    // régi UI mezők
    TanuloId?: number;
    Tipus?: KretaEnum;
    Keses?: number;

    // ujkreta API mezők
    Uid?: string;
    TanuloUid?: string;
    Datum?: string;
    KesesPercben?: number;
    OsztalyCsoportUid?: string;
    [key: string]: any;
}