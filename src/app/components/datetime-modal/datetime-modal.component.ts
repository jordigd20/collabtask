import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ModalController, IonDatetime } from '@ionic/angular';

@Component({
  selector: 'app-datetime-modal',
  templateUrl: './datetime-modal.component.html',
  styleUrls: ['./datetime-modal.component.scss']
})
export class DatetimeModalComponent implements OnInit {
  @ViewChild('datetime') datetime: IonDatetime = {} as IonDatetime;
  @Input() previousDate: string = '';

  minDate: string = new Date().toISOString();
  dateValue: string = '';

  constructor(private modalController: ModalController) {}

  ngOnInit() {}

  onChangeDate(event: any) {
    this.dateValue = event.detail.value;
  }

  async cancel() {
    await this.datetime.cancel();
    this.modalController.dismiss({
      canceled: true
    });
  }

  async accept() {
    await this.datetime.confirm();
    this.modalController.dismiss({
      date: this.dateValue
    });
  }
}
