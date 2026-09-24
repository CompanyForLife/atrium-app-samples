import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SpecHeading } from '../../content/spec-section';

@Component({
    selector: 'app-toc',
    imports: [RouterLink],
    templateUrl: './toc.component.html',
    styleUrl: './toc.component.scss'
})
export class TocComponent {
    readonly headings = input<SpecHeading[]>([]);
}
