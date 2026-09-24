import specSections from './spec-content.generated.json';
import { SpecSection } from './spec-section';
import { SAMPLES } from './samples';

export interface SearchEntry {
    title: string;
    subtitle: string;
    path: string[];
    fragment?: string;
}

const SECTIONS = specSections as SpecSection[];

function buildIndex(): SearchEntry[] {
    const entries: SearchEntry[] = [];

    for (const section of SECTIONS) {
        entries.push({
            title: section.title,
            subtitle: `Section ${section.number}`,
            path: ['/docs', section.slug]
        });

        for (const heading of section.headings) {
            entries.push({
                title: heading.text,
                subtitle: section.title,
                path: ['/docs', section.slug],
                fragment: heading.id
            });
        }
    }

    for (const sample of SAMPLES) {
        entries.push({
            title: sample.title,
            subtitle: 'App sample',
            path: ['/samples', sample.slug]
        });
    }

    return entries;
}

export const SEARCH_INDEX: SearchEntry[] = buildIndex();
