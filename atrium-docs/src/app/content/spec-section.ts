export interface SpecHeading {
    level: number;
    text: string;
    id: string;
}

export interface SpecSection {
    number: number;
    title: string;
    slug: string;
    headings: SpecHeading[];
    html: string;
}
