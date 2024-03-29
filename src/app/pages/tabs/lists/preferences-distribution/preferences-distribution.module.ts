import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PreferencesDistributionPageRoutingModule } from './preferences-distribution-routing.module';
import { PreferencesDistributionPage } from './preferences-distribution.page';
import { ComponentsModule } from '../../../../components/components.module';
import { PipesModule } from '../../../../pipes/pipes.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PreferencesDistributionPageRoutingModule,
    ComponentsModule,
    PipesModule
  ],
  declarations: [PreferencesDistributionPage]
})
export class PreferencesDistributionPageModule {}
