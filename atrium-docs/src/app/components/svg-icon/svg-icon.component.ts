import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

@Component({
    selector: 'svg-icon',
    templateUrl: './svg-icon.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SvgIconComponent {
    readonly name = input<string | undefined>(undefined);
    readonly color = input<string | undefined>(undefined);
    readonly rotate = input<boolean>(false);
}
