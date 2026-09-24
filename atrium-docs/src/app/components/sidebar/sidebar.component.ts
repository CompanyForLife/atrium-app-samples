import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import specSections from '../../content/spec-content.generated.json';
import { SpecSection } from '../../content/spec-section';

interface SidebarGroup {
    label: string;
    sections: SpecSection[];
}

const SECTIONS = specSections as SpecSection[];

const GROUP_RANGES: { label: string; from: number; to: number }[] = [
    { label: 'Getting started', from: 1, to: 1 },
    { label: 'The runtime contract', from: 2, to: 5 },
    { label: 'In the Store', from: 6, to: 8 },
    { label: 'Build & run', from: 9, to: 10 },
    { label: 'Reference', from: 11, to: 11 },
];

@Component({
    selector: 'app-sidebar',
    imports: [RouterLink, RouterLinkActive],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
    protected readonly groups: SidebarGroup[] = GROUP_RANGES.map(group => ({
        label: group.label,
        sections: SECTIONS.filter(section => section.number >= group.from && section.number <= group.to)
    }));
}
