import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TeamService } from '../../../services/team.service';
import { TaskList, Team } from '../../../interfaces';

@Component({
  selector: 'app-task-list-form',
  templateUrl: './task-list-form.page.html',
  styleUrls: ['./task-list-form.page.scss']
})
export class TaskListFormPage implements OnInit {
  taskListForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    distributionType: ['manual', Validators.required]
  });
  headerTitle: string = 'Crear lista de tareas';
  buttonText: string = 'Crear lista de tareas';
  isLoading: boolean = false;
  idTeam: string | undefined;
  idTaskList: string | undefined;
  taskList: TaskList | undefined;

  constructor(
    private fb: FormBuilder,
    private activeRoute: ActivatedRoute,
    private teamService: TeamService,
    private router: Router
  ) {}

  get name() {
    return this.taskListForm.get('name');
  }

  get distributionType() {
    return this.taskListForm.get('distributionType');
  }

  async ngOnInit() {
    this.idTeam = this.activeRoute.snapshot.params['idTeam'];
    this.idTaskList = this.activeRoute.snapshot.params['idTaskList'];

    if (!this.idTeam || !this.idTaskList) {
      return;
    }

    this.headerTitle = 'Editar lista de tareas';
    this.buttonText = 'Guardar cambios';

    this.teamService.getTeam(this.idTeam).subscribe((team) => {
      if (team) {
        this.fillComponentData(team);
      } else {
        this.router.navigate(['tabs/lists']);
      }
    });
  }

  fillComponentData(team: Team) {
    this.taskList = team.taskLists[this.idTaskList!];
    const { name, distributionType } = this.taskList;

    this.taskListForm.setValue({
      name,
      distributionType
    });
  }

  async createTaskList() {
    if (!this.taskListForm.valid) return;

    this.isLoading = true;
    await this.teamService.createTaskList(this.idTeam!, this.taskListForm.value);
    this.isLoading = false;
  }

  async updateTaskList() {
    if (!this.taskListForm.valid || !this.taskList) return;

    this.isLoading = true;
    await this.teamService.updateTaskListProperties(
      this.idTeam!,
      this.idTaskList!,
      true,
      this.taskListForm.value
    );
    this.isLoading = false;
  }

  setDistributionType(type: 'manual' | 'preferences') {
    this.taskListForm.patchValue({
      distributionType: type
    });
  }
}
