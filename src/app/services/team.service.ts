import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { TeamData, Team, TeamErrorCodes, UserMember, TaskListData, TaskList } from '../interfaces';
import { nanoid } from 'nanoid';
import { StorageService } from './storage.service';
import { map, throwError, mergeMap, of, lastValueFrom, tap, debounceTime } from 'rxjs';
import { ToastController } from '@ionic/angular';
import firebase from 'firebase/compat/app';

@Injectable({
  providedIn: 'root'
})
export class TeamService {
  teamsList: Team[] = [];

  constructor(
    private afs: AngularFirestore,
    private storageService: StorageService,
    private toastController: ToastController
  ) {}

  get teams() {
    return this.teamsList;
  }

  getTeam(id: string) {
    return this.afs
      .doc<Team>(`teams/${id}`)
      .get()
      .pipe(map((team) => team.data()));
  }

  getAllUserTeams(userId: string) {
    return this.afs
      .collection<Team>('teams', (ref) =>
        ref.where(`idUserMembers`, 'array-contains', userId).orderBy('dateCreated', 'asc')
      )
      .valueChanges()
      .pipe(
        tap((teams) => {
          this.teamsList = teams;
        }),
        debounceTime(350)
      );
  }

  async createTeam({ name, allowNewMembers }: TeamData) {
    try {
      const id = this.afs.createId();
      const invitationCode = nanoid(12);

      const { id: userId, username } = await this.storageService.get('user');

      const userMembers: { [key: string]: UserMember } = {
        [userId]: {
          id: userId,
          name: username,
          role: 'admin',
          userTotalScore: 0
        }
      };

      await this.afs.doc<Team>(`teams/${id}`).set({
        id,
        name: name.trim(),
        allowNewMembers,
        invitationCode,
        idUserMembers: [userId],
        userMembers,
        taskLists: {},
        dateCreated: firebase.firestore.FieldValue.serverTimestamp()
      });

      this.showToast(`${name} se ha creado correctamente`);
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async updateTeamProperties(
    id: string,
    { name, allowNewMembers }: TeamData,
    userMembers: { [key: string]: UserMember }
  ) {
    try {
      const { id: userId } = await this.storageService.get('user');

      if (userMembers[userId].role !== 'admin') {
        throw new Error(TeamErrorCodes.TeamUserPermissionDenied);
      }

      await this.afs.doc<Team>(`teams/${id}`).update({ name, allowNewMembers });
      this.showToast(`${name} se ha actualizado correctamente`);
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async createTaskList(idTeam: string, { name, distributionType }: TaskListData) {
    try {
      const team = await lastValueFrom(this.getTeam(idTeam));

      if (!team) {
        throw new Error('No se ha encontrado el equipo');
      }

      if (Object.keys(team.taskLists).length >= 5) {
        throw new Error(TeamErrorCodes.TeamReachedMaxTaskLists);
      }

      const id = this.afs.createId();
      const taskList: TaskList = {
        id,
        name: name.trim(),
        distributionType,
        userScore: {}
      };

      for (const user of Object.values(team.userMembers)) {
        taskList.userScore[user.id] = 0;
      }

      await this.afs.doc<Team>(`teams/${idTeam}`).update({
        taskLists: { ...team.taskLists, [id]: taskList }
      });

      this.showToast(`${name} se ha creado correctamente`);
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async updateTaskListProperties(
    idTeam: string,
    idTaskList: string,
    { name, distributionType }: TaskListData
  ) {
    try {
      await this.afs.doc<Team>(`teams/${idTeam}`).update({
        [`taskLists.${idTaskList}.name`]: name,
        [`taskLists.${idTaskList}.distributionType`]: distributionType
      });

      this.showToast(`${name} se ha actualizado correctamente`);
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  //TODO:
  async leaveTeam(idTeam: string) {
    try {
      let teamFound = this.teamsList.find((team) => team.id === idTeam);

      if (!teamFound) {
        const team = await lastValueFrom(this.getTeam(idTeam));

        if (!team) {
          throw new Error('No se ha encontrado el equipo');
        }

        teamFound = team;
      }

      if (Object.keys(teamFound!.userMembers).length === 1) {
        this.deleteTeam(idTeam);
      } else {
        this.removeUserFromTeam(idTeam);
      }
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  //TODO:
  async deleteTeam(idTeam: string) {
    try {
      await this.afs.doc<Team>(`teams/${idTeam}`).delete();

      this.showToast('Has abandonado el equipo');
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  //TODO:
  async removeUserFromTeam(idTeam: string) {
    try {
      const { id: userId } = await this.storageService.get('user');

      await this.afs.doc<Team>(`teams/${idTeam}`).update({
        [`userMembers.${userId}`]: firebase.firestore.FieldValue.delete(),
        [`idUserMembers`]: firebase.firestore.FieldValue.arrayRemove(userId) as unknown as string[]
      });

      this.showToast('Has abandonado el equipo');
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async joinTeam(invitationCode: string) {
    const teamsCollection = this.afs.collection<Team>('teams', (ref) =>
      ref.where('invitationCode', '==', invitationCode)
    );

    const { id: userId, username } = await this.storageService.get('user');

    return teamsCollection.get().pipe(
      mergeMap((teamFound) => {
        if (teamFound.empty) {
          return throwError(() => new Error(TeamErrorCodes.TeamInvitationCodeNotFound));
        }

        const { allowNewMembers, userMembers } = teamFound.docs[0].data();
        const userMembersListById = Object.keys(userMembers);

        if (!allowNewMembers) {
          return throwError(() => new Error(TeamErrorCodes.TeamDoesNotAllowNewMembers));
        }

        if (userMembersListById.length > 10) {
          return throwError(() => new Error(TeamErrorCodes.TeamReachedMaxMembers));
        }

        for (const id of userMembersListById) {
          if (id === userId) {
            return throwError(() => new Error(TeamErrorCodes.TeamUserIsAlreadyMember));
          }
        }

        return of(teamFound);
      }),
      tap(async (teamFound) => {
        try {
          console.log(teamFound.docs[0].data());
          const { id, userMembers, taskLists, idUserMembers } = teamFound.docs[0].data();

          const user = {
            id: userId,
            name: username,
            role: 'member',
            userTotalScore: 0
          };

          if (Object.values(taskLists).length > 0) {
            for (const list of Object.values(taskLists)) {
              taskLists[list.id].userScore[userId] = 0;
            }
          }

          await teamsCollection.doc(id).update({
            idUserMembers: [...idUserMembers, userId],
            userMembers: { ...userMembers, [userId]: user },
            taskLists: { ...taskLists }
          });

          this.showToast('¡Te has unido al equipo correctamente!');
        } catch (error: any) {
          const { code } = { error }.error;
          console.error(error);
          this.handleError({ message: code });
        }
      })
    );
  }

  handleError(error: any) {
    let message = '';

    switch (error.message) {
      case TeamErrorCodes.TeamInvitationCodeNotFound:
        message = 'No se ha encontrado ningún equipo con ese código de invitación';
        break;
      case TeamErrorCodes.TeamDoesNotAllowNewMembers:
        message = 'Este equipo no permite nuevos miembros';
        break;
      case TeamErrorCodes.TeamUserIsAlreadyMember:
        message = 'Ya eres miembro de este equipo';
        break;
      case TeamErrorCodes.TeamReachedMaxMembers:
        message = 'No se pueden añadir más miembros a este equipo';
        break;
      case TeamErrorCodes.TeamReachedMaxTaskLists:
        message = 'Este equipo ha alcanzado el máximo de listas de tareas disponibles';
        break;
      case TeamErrorCodes.TeamUserPermissionDenied:
        message = 'Solo los administradores pueden realizar esta acción';
        break;
      case TeamErrorCodes.FirestorePermissionDenied:
        message = 'No tienes el permiso suficiente para realizar esta acción';
        break;
      default:
        message = 'Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo más tarde';
        break;
    }

    this.showToast(message);
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'secondary',
      keyboardClose: true,
      cssClass: 'custom-toast'
    });

    await toast.present();
  }
}
