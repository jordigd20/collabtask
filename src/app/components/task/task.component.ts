import { Component, Input, OnInit } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
import { TeamService } from '../../services/team.service';
import { Task, UserMember } from '../../interfaces';
import { TaskService } from '../../services/task.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-task',
  templateUrl: './task.component.html',
  styleUrls: ['./task.component.scss'],
})
export class TaskComponent implements OnInit {
  @Input() task: Task = {} as Task;
  @Input() teamName: string = '';
  @Input() idTeam: string = '';
  @Input() idTaskList: string = '';
  @Input() idTask: string = '';
  @Input() idUser: string = '';
  @Input() withoutUserAssigned: boolean = false;
  @Input() showCompleteButton: boolean = true;
  @Input() showDistributionMode: boolean = false;

  photoURL: string = '';
  username: string = '';
  userTeamMembers: UserMember[] = [];

  constructor(
    private teamService: TeamService,
    private taskService: TaskService,
    private actionSheetController: ActionSheetController,
    private router: Router
  ) {}

  ngOnInit() {
    this.teamService.getUserMembersFromTeam(this.idTeam).subscribe((users) => {
      this.userTeamMembers = users;
      const currentUser = this.userTeamMembers.find((user) => user.id === this.idUser);

      if (currentUser && this.photoURL !== currentUser.photoURL) {
        this.photoURL = currentUser.photoURL;
      }

      if (currentUser && this.username !== currentUser.name) {
        this.username = currentUser.name;
      }

    });
  }

  click() {
    console.log('click');
  }

  async moreOptions() {
    const actionSheet = await this.actionSheetController.create({
      htmlAttributes: {
        'aria-label': 'Acciones de la tarea'
      },
      buttons: [
        {
          text: 'Editar',
          icon: 'create-outline',
          cssClass: 'action-sheet-custom-icon',
          handler: () => {
            this.router.navigate([`edit-task/${this.idTaskList}/${this.idTask}`]);
          }
        },
        {
          text: this.withoutUserAssigned ? 'Asignar a usuario' : 'Desasignar usuario',
          icon: this.withoutUserAssigned ? 'person-add-outline' : 'person-remove-outline',
          cssClass: 'action-sheet-custom-icon ',
          handler: () => {
            this.withoutUserAssigned ? this.selectUser(this.userTeamMembers) : this.unassignUser();
            console.log('Asignar a usuario');
          }
        },
        {
          text: 'Eliminar',
          icon: 'trash-outline',
          cssClass: 'action-sheet-danger-icon',
          handler: () => {
            this.taskService.deleteTask(this.idTask);
          }
        }
      ]
    });

    await actionSheet.present();
  }

  async selectUser(users: UserMember[]) {
    const buttons = users.map((user) => {
      return {
        text: user.name,
        cssClass: 'action-sheet-custom-icon',
        handler: () => {
          this.taskService.temporarilyAssignTask(this.idTask, user.id);
        }
      };
    });

    const actionSheet = await this.actionSheetController.create({
      htmlAttributes: {
        'aria-label': 'Acciones de la tarea'
      },
      cssClass: 'action-sheet-large',
      buttons
    });

    await actionSheet.present();
  }

  unassignUser() {
    this.taskService.temporarilyAssignTask(this.idTask, '');
  }
}
